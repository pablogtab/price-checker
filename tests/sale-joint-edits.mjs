import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Local disposable API required");
async function req(
  path,
  body,
  method = "POST",
  status = body === undefined ? 200 : 201,
) {
  const r = await fetch(
    base + "/api/" + path,
    body === undefined
      ? {}
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const v = await r.json();
  assert.equal(r.status, status, JSON.stringify(v));
  return v;
}
async function fixture(total = "20000") {
  const tag = randomUUID(),
    c = await req("customers", { name: "Joint " + tag }),
    a = await req("cash/accounts", {
      name: "Joint cash " + tag,
      currency: "ARS",
      opening_balance: "0",
    }),
    p = await req("products", {
      name: "Joint product " + tag,
      selling_price: total,
    });
  await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: p.id, quantity: 1 }],
    payment: { account_id: a.id, amount: total, occurred_on: "2026-10-21" },
  });
  const old = (await req("sales")).find((x) => x.id === s.id);
  return { c, a, p, s: old };
}
function body(f, price = "18000") {
  return {
    customer_id: f.c.id,
    sold_on: "2026-10-20",
    items: [
      {
        id: f.s.items[0].id,
        product_id: f.p.id,
        quantity: 1,
        unit_price: price,
      },
    ],
    payments: f.s.payments.map((p) => ({
      id: p.id,
      amount: price,
      account_id: p.account_id,
      occurred_on: p.occurred_on,
    })),
  };
}
test("paid sale 20000 → 18000 corrects one sale and one receipt atomically without changing stock", async () => {
  const f = await fixture();
  assert.equal(f.s.paid, "20000");
  const b = body(f),
    p = await req(`sales/${f.s.id}/joint-edit/preview`, b);
  assert.equal(p.after.total, "18000");
  assert.equal(p.after.paid, "18000");
  assert.equal(p.cash[0].delta, "-2000");
  assert.equal(p.stock[0].delta, 0);
  const confirm = {
    ...b,
    preview_token: p.preview_token,
    request_key: randomUUID(),
  };
  await req(`sales/${f.s.id}/joint-edits`, confirm);
  await req(`sales/${f.s.id}/joint-edits`, confirm);
  const sales = await req("sales"),
    s = sales.find((s) => s.id === f.s.id);
  assert.equal(s.total, "18000");
  assert.equal(s.paid, "18000");
  assert.equal(s.items[0].id, f.s.items[0].id);
  assert.equal(
    (await req("products")).find((p) => p.id === f.p.id).own_stock,
    9,
  );
  assert.equal(
    (await req("cash/accounts")).find((a) => a.id === f.a.id).balance,
    "18000",
  );
});
test("shared receipt moves only selected application, transfers debt on customer change and keeps other sale unchanged", async () => {
  const f = await fixture("60000");
  // Start a separate unpaid pair, then settle both using one customer collection.
  const make = async (total) =>
    req("sales", {
      request_key: randomUUID(),
      customer_id: f.c.id,
      sold_on: "2026-10-21",
      items: [{ product_id: f.p.id, quantity: 1, unit_price: total }],
    });
  const s1 = await make("60000"),
    s2 = await make("40000");
  const pay = {
      amount: "100000",
      account_id: f.a.id,
      occurred_on: "2026-10-21",
    },
    pp = await req(`customers/${f.c.id}/payments/preview`, pay);
  await req(`customers/${f.c.id}/payments`, {
    ...pay,
    preview_token: pp.token,
    request_key: randomUUID(),
  });
  const rows = await req("sales");
  f.s = rows.find((x) => x.id === s1.id);
  const untouched = rows.find((x) => x.id === s2.id);
  const dest = await req("cash/accounts", {
      name: "Joint destination " + randomUUID(),
      currency: "ARS",
      opening_balance: "0",
    }),
    client = await req("customers", { name: "New debt " + randomUUID() });
  const b = body(f, "55000");
  b.customer_id = client.id;
  b.payments[0].amount = "50000";
  b.payments[0].account_id = dest.id;
  b.payments[0].occurred_on = "2026-10-19";
  const preview = await req(`sales/${s1.id}/joint-edit/preview`, b);
  assert.equal(preview.after.pending, "5000");
  assert.equal(
    preview.debts.find((d) => d.customer_id === client.id).after,
    "5000",
  );
  await req(`sales/${s1.id}/joint-edits`, {
    ...b,
    preview_token: preview.preview_token,
    request_key: randomUUID(),
  });
  const after = (await req("sales")).find((x) => x.id === s2.id);
  assert.deepEqual(after, untouched);
  const accounts = await req("cash/accounts");
  assert.equal(accounts.find((a) => a.id === f.a.id).balance, "100000");
  assert.equal(accounts.find((a) => a.id === dest.id).balance, "50000");
  const clients = await req("customers");
  assert.equal(clients.find((c) => c.id === f.c.id).balance, "0");
  assert.equal(clients.find((c) => c.id === client.id).balance, "5000");
  const ledger = await req(`customers/${client.id}/ledger`);
  assert.ok(JSON.stringify(ledger).includes("55000"));
});
test("excess payment, missing debtor, invalid applications and cents are validated before mutation", async () => {
  const f = await fixture("20.01"),
    b = body(f, "18.01");
  const invalid = structuredClone(b);
  invalid.payments[0].amount = "20.01";
  await req(`sales/${f.s.id}/joint-edit/preview`, invalid, "POST", 400);
  const anonymous = structuredClone(b);
  anonymous.customer_id = null;
  anonymous.payments[0].amount = "1";
  await req(`sales/${f.s.id}/joint-edit/preview`, anonymous, "POST", 400);
  const bad = structuredClone(b);
  bad.payments[0].amount = "1.001";
  await req(`sales/${f.s.id}/joint-edit/preview`, bad, "POST", 400);
  const p = await req(`sales/${f.s.id}/joint-edit/preview`, b);
  assert.equal(p.cash[0].delta, "-2");
  await req(`sales/${f.s.id}/joint-edits`, {
    ...b,
    preview_token: p.preview_token,
    request_key: randomUUID(),
  });
  assert.equal((await req("sales")).find((x) => x.id === f.s.id).paid, "18.01");
});
test("joint correction rejects stale state, serializes concurrent confirmations and rolls back every effect after injected failure", async () => {
  const f = await fixture(),
    b = body(f),
    p = await req(`sales/${f.s.id}/joint-edit/preview`, b);
  await req(`products/${f.p.id}/stock`, { quantity: 20 }, "PUT", 200);
  await req(
    `sales/${f.s.id}/joint-edits`,
    { ...b, preview_token: p.preview_token, request_key: randomUUID() },
    "POST",
    409,
  );
  const valid = await req(`sales/${f.s.id}/joint-edit/preview`, b);
  const { execFileSync } = await import("node:child_process");
  const db = process.env.TEST_JOINT_DATABASE || "ventas_ticket9_test";
  assert.match(db, /^[a-z0-9_]+_test$/);
  const sql = (text) =>
    execFileSync("docker", [
      "exec",
      "price-checker-db-1",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "price_checker",
      "-d",
      db,
      "-c",
      text,
    ]);
  sql(
    "CREATE FUNCTION joint_fail_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'joint rollback'; END $$;CREATE TRIGGER joint_fail BEFORE INSERT ON sale_corrections FOR EACH ROW EXECUTE FUNCTION joint_fail_test();",
  );
  const changed = structuredClone(b);
  changed.items[0].quantity = 2;
  const failPreview = await req(`sales/${f.s.id}/joint-edit/preview`, changed);
  try {
    await req(
      `sales/${f.s.id}/joint-edits`,
      {
        ...changed,
        preview_token: failPreview.preview_token,
        request_key: randomUUID(),
      },
      "POST",
      500,
    );
  } finally {
    sql(
      "DROP TRIGGER joint_fail ON sale_corrections;DROP FUNCTION joint_fail_test();",
    );
  }
  const s = (await req("sales")).find((x) => x.id === f.s.id);
  assert.equal(s.total, "20000");
  assert.equal(s.paid, "20000");
  assert.equal(s.items[0].quantity, 1);
  assert.equal(
    (await req("products")).find((x) => x.id === f.p.id).own_stock,
    20,
  );
  assert.equal(
    (await req("cash/accounts")).find((x) => x.id === f.a.id).balance,
    "20000",
  );
  const result = await Promise.all(
    [1, 2].map(() =>
      fetch(base + `/api/sales/${f.s.id}/joint-edits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...b,
          preview_token: valid.preview_token,
          request_key: randomUUID(),
        }),
      }),
    ),
  );
  assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
});
test("a concurrent collection invalidates joint review and annulled sales reject joint corrections", async () => {
  const f = await fixture();
  const partial = {
      amount: "19000",
      account_id: f.a.id,
      occurred_on: "2026-10-21",
    },
    p0 = await req(
      `sales/${f.s.id}/payments/${f.s.payments[0].id}/preview`,
      partial,
    );
  await req(`sales/${f.s.id}/payments/${f.s.payments[0].id}/corrections`, {
    ...partial,
    preview_token: p0.preview_token,
    request_key: randomUUID(),
  });
  f.s = (await req("sales")).find((x) => x.id === f.s.id);
  const b = body(f, "18000"),
    p = await req(`sales/${f.s.id}/joint-edit/preview`, b);
  await req(`sales/${f.s.id}/payments`, {
    amount: "1",
    account_id: f.a.id,
    occurred_on: "2026-10-21",
    request_key: randomUUID(),
  });
  await req(
    `sales/${f.s.id}/joint-edits`,
    { ...b, request_key: randomUUID(), preview_token: p.preview_token },
    "POST",
    409,
  );
  const annul = await req(`sales/${f.s.id}/annul/preview`, {});
  await req(`sales/${f.s.id}/annul`, {
    preview_token: annul.preview_token,
    request_key: randomUUID(),
  });
  await req(`sales/${f.s.id}/joint-edit/preview`, b, "POST", 400);
  assert.equal(
    (await req("sales")).find((x) => x.id === f.s.id).status,
    "annulled",
  );
});
test("joint corrections preserve historical costs and update dashboard profitability and customer ledger consistently", async () => {
  const f = await fixture("20000");
  const { execFileSync } = await import("node:child_process");
  const db = process.env.TEST_JOINT_DATABASE || "ventas_ticket9_test";
  assert.match(db, /^[a-z0-9_]+_test$/);
  // Fixture represents the original 5000 unit cost; all behavior assertions use public REST.
  execFileSync("docker", [
    "exec",
    "price-checker-db-1",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "price_checker",
    "-d",
    db,
    "-c",
    `UPDATE sale_components SET unit_cost=5000 WHERE sale_item_id=${f.s.items[0].id};UPDATE sale_items SET cost_total=5000 WHERE id=${f.s.items[0].id};UPDATE sales SET cost_total=5000 WHERE id=${f.s.id};`,
  ]);
  const summary = await req("sales/summary"),
    b = body(f, "18000");
  b.items[0].quantity = 2;
  b.payments[0].amount = "30000";
  const p = await req(`sales/${f.s.id}/joint-edit/preview`, b);
  assert.equal(p.after.cost_total, "10000");
  assert.equal(p.after.pending, "6000");
  await req(`sales/${f.s.id}/joint-edits`, {
    ...b,
    preview_token: p.preview_token,
    request_key: randomUUID(),
  });
  const after = (await req("sales")).find((x) => x.id === f.s.id);
  assert.equal(after.total, "36000");
  assert.equal(after.cost_total, "10000");
  assert.equal(after.items[0].components[0].unit_cost, "5000");
  const next = await req("sales/summary");
  assert.equal(Number(next.profit) - Number(summary.profit), 11000);
  const detail = await req(`customers/${f.c.id}`);
  assert.ok(JSON.stringify(detail).includes("6000"));
  const ledger = await req(`customers/${f.c.id}/ledger`);
  assert.ok(JSON.stringify(ledger).includes("36000"));
  assert.ok(JSON.stringify(ledger).includes("30000"));
});
