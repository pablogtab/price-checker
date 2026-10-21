import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.TEST_CUSTOMER_DATABASE_URL;
test(
  "Customers: complete history, search, allocation, concurrency and cash integrity",
  { skip: !url },
  async () => {
    if (!new URL(url!).pathname.endsWith("_test"))
      throw new Error("Use a disposable _test database");
    process.env.DATABASE_URL = url;
    const { db, connect } = await import("./db");
    const { saveCustomer, collectSale } = await import("./sales");
    const {
      customerSearch,
      customerDetail,
      customerSales,
      customerLedger,
      previewCustomerPayment,
      collectCustomer,
    } = await import("./customers");
    await connect();
    try {
      await db.query(
        "TRUNCATE customers,sales,cash_accounts RESTART IDENTITY CASCADE",
      );
      const c = await saveCustomer({
        name: "María González",
        phone: "+54 (11) 1234-5678",
        instagram: "@maria",
        note: "Entrega por la tarde",
      });
      const empty = await saveCustomer({ name: "Sin ventas" });
      const [account] = await db.query(
        "INSERT INTO cash_accounts(name,currency,opening_balance) VALUES('Transferencia','ARS',0) RETURNING id",
      );
      const [usd] = await db.query(
        "INSERT INTO cash_accounts(name,currency,opening_balance) VALUES('USD','USD',0) RETURNING id",
      );
      const [uninitialized] = await db.query(
        "INSERT INTO cash_accounts(name,currency) VALUES('Sin saldo','ARS') RETURNING id",
      );
      const saleIds: number[] = [];
      for (let i = 0; i < 110; i++) {
        const [s] = await db.query(
          "INSERT INTO sales(customer_id,customer_name,sold_on,total,request_key,fingerprint) VALUES($1,$2,$3,100,$4,'fixture') RETURNING id",
          [
            c.id,
            c.name,
            `2026-01-${String(1 + Math.floor(i / 4)).padStart(2, "0")}`,
            randomUUID(),
          ],
        );
        saleIds.push(s.id);
      }
      for (let i = 0; i < 28; i++)
        await saveCustomer({ name: "Cliente " + String(i).padStart(2, "0") });
      let list = await customerSearch({ search: "maria gonzalez" });
      assert.equal(list.total, 1);
      assert.equal(list.items[0].sale_count, 110);
      assert.equal(list.summary.customers, 30);
      assert.equal((await customerSearch({ search: "1112345678" })).total, 1);
      assert.equal(
        (await customerSearch({ search: "@maria", status: "debt" })).total,
        1,
      );
      assert.equal((await customerSearch({ status: "new" })).total, 29);
      assert.equal((await customerSearch({ status: "settled" })).total, 0);
      list = await customerSearch({ sort: "balance", direction: "desc" });
      assert.equal(list.items[0].id, c.id);
      assert.equal(list.items.length, 25);
      assert.equal((await customerSearch({ page: 2 })).items.length, 5);
      await assert.rejects(() => customerSearch({ sort: "DROP TABLE" }));
      const allIds = [];
      for (let page = 1; page <= 5; page++)
        allIds.push(
          ...(await customerSales(c.id, { page })).items.map((s: any) => s.id),
        );
      assert.equal(new Set(allIds).size, 110);
      assert.equal((await customerDetail(c.id)).balance, "11000");
      let preview = await previewCustomerPayment(c.id, { amount: "250" });
      assert.deepEqual(
        preview.allocations.map((p: any) => [p.sale_id, p.amount]),
        [
          [saleIds[0], "100"],
          [saleIds[1], "100"],
          [saleIds[2], "50"],
        ],
      );
      const body = {
        amount: "250",
        account_id: account.id,
        occurred_on: "2026-02-01",
        request_key: randomUUID(),
        preview_token: preview.token,
      };
      const [a, b] = await Promise.all([
        collectCustomer(c.id, body),
        collectCustomer(c.id, body),
      ]);
      assert.equal(a.id, b.id);
      assert.equal((await db.query("SELECT * FROM cash_entries")).length, 1);
      assert.equal((await db.query("SELECT * FROM sale_payments")).length, 3);
      assert.equal((await customerDetail(c.id)).balance, "10750");
      await assert.rejects(() =>
        collectCustomer(c.id, { ...body, amount: "251" }),
      );
      const ledger = await customerLedger(c.id, {});
      assert.equal(ledger.total, 111);
      assert.equal(ledger.items[0].credit, "250");
      assert.equal(ledger.items[0].balance, "10750");
      let count = 0;
      for (let page = 1; page <= 5; page++)
        count += (await customerLedger(c.id, { page })).items.length;
      assert.equal(count, 111);
      preview = await previewCustomerPayment(c.id, { amount: "50" });
      await collectSale(saleIds[2], {
        amount: "10",
        account_id: account.id,
        occurred_on: "2026-02-01",
        request_key: randomUUID(),
      });
      await assert.rejects(
        () =>
          collectCustomer(c.id, {
            ...body,
            amount: "50",
            request_key: randomUUID(),
            preview_token: preview.token,
          }),
        /saldo cambió/,
      );
      preview = await previewCustomerPayment(c.id, { amount: "50" });
      for (const id of [usd.id, uninitialized.id, 99999])
        await assert.rejects(() =>
          collectCustomer(c.id, {
            ...body,
            amount: "50",
            account_id: id,
            request_key: randomUUID(),
            preview_token: preview.token,
          }),
        );
      assert.equal((await customerDetail(c.id)).balance, "10740");
      for (const amount of ["0", "-1", "0.001", "999999"])
        await assert.rejects(() => previewCustomerPayment(c.id, { amount }));
      await assert.rejects(() => customerDetail(99999));
      assert.equal((await customerLedger(empty.id, {})).total, 0);
      preview = await previewCustomerPayment(c.id, { amount: "40" });
      const results = await Promise.allSettled([
        collectCustomer(c.id, {
          ...body,
          amount: "40",
          request_key: randomUUID(),
          preview_token: preview.token,
        }),
        collectSale(saleIds[2], {
          amount: "40",
          account_id: account.id,
          occurred_on: "2026-02-01",
          request_key: randomUUID(),
        }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const [cash] = await db.query(
        "SELECT sum(amount)::text total FROM cash_entries",
      );
      const [paid] = await db.query(
        "SELECT sum(amount)::text total FROM sale_payments",
      );
      assert.equal(cash.total, paid.total);
      assert.equal(cash.total, "300");
      // Exercise transaction rollback after the cash operation was inserted.
      await db.query(
        "CREATE FUNCTION reject_customer_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$",
      );
      await db.query(
        "CREATE TRIGGER reject_customer_allocation BEFORE INSERT ON sale_payments FOR EACH ROW EXECUTE FUNCTION reject_customer_allocation()",
      );
      preview = await previewCustomerPayment(c.id, { amount: "10" });
      const rollbackKey = randomUUID();
      await assert.rejects(
        () =>
          collectCustomer(c.id, {
            ...body,
            amount: "10",
            request_key: rollbackKey,
            preview_token: preview.token,
          }),
        /test rollback/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT id FROM cash_operations WHERE request_key=$1",
            [rollbackKey],
          )
        ).length,
        0,
      );
      await db.query(
        "DROP TRIGGER reject_customer_allocation ON sale_payments; DROP FUNCTION reject_customer_allocation()",
      );
      const debt = (await customerDetail(c.id)).balance;
      preview = await previewCustomerPayment(c.id, { amount: debt });
      await collectCustomer(c.id, {
        ...body,
        amount: debt,
        request_key: randomUUID(),
        preview_token: preview.token,
      });
      assert.equal((await customerDetail(c.id)).balance, "0");
      assert.equal((await customerSearch({ status: "settled" })).total, 1);
      await saveCustomer(
        {
          name: "María González editada",
          phone: "12345678",
          instagram: "@maria.fit",
          note: "Dato persistido",
        },
        c.id,
      );
      await db.destroy();
      await connect();
      const restored = await customerDetail(c.id);
      assert.equal(restored.name, "María González editada");
      assert.equal(restored.instagram, "@maria.fit");
      assert.equal(restored.balance, "0");
      assert.equal(restored.sale_count, 110);
      assert.equal((await collectCustomer(c.id, body)).id, a.id);
    } finally {
      await db.query(
        "DROP TRIGGER IF EXISTS reject_customer_allocation ON sale_payments; DROP FUNCTION IF EXISTS reject_customer_allocation()",
      );
      await db.destroy();
    }
  },
);
