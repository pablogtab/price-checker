import { readAllSales } from "./helpers/sales.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Use disposable local API");
async function req(path, body, method = "POST", status = 201) {
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
  assert.equal(r.status, body === undefined ? 200 : status, JSON.stringify(v));
  return v;
}
test("annul restores current stock, reverses only shared application, preserves history and retries", async () => {
  const c = await req("customers", { name: "Anulación " + Date.now() });
  const a = await req("cash/accounts", {
    name: "Anulación " + Date.now(),
    currency: "ARS",
    opening_balance: "0",
  });
  const p = await req("products", {
    name: "Anulación " + Date.now(),
    selling_price: "60000",
  });
  await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const sale = (total) =>
    req("sales", {
      customer_id: c.id,
      sold_on: "2026-10-21",
      items: [{ product_id: p.id, quantity: 1, unit_price: total }],
      request_key: randomUUID(),
    });
  const s = await sale("60000"),
    other = await sale("40000");
  const pay = { amount: "100000", account_id: a.id, occurred_on: "2026-10-21" };
  const allocation = await req(`customers/${c.id}/payments/preview`, pay);
  await req(`customers/${c.id}/payments`, {
    ...pay,
    preview_token: allocation.token,
    request_key: randomUUID(),
  });
  await req(`products/${p.id}/stock`, { quantity: 20 }, "PUT", 200);
  const preview = await req(`sales/${s.id}/annul/preview`, {});
  assert.equal(preview.stock[0].before, 20);
  assert.equal(preview.stock[0].after, 21);
  assert.equal(preview.cash[0].delta, "-60000");
  assert.equal(
    (await readAllSales(req)).find((x) => x.id === s.id).status,
    "active",
  );
  const summaryBefore = await req("sales/summary");
  const body = {
    preview_token: preview.preview_token,
    request_key: randomUUID(),
  };
  const result = await req(`sales/${s.id}/annul`, body);
  assert.deepEqual(await req(`sales/${s.id}/annul`, body), result);
  const summaryAfter = await req("sales/summary");
  assert.equal(Number(summaryBefore.total) - Number(summaryAfter.total), 60000);
  assert.equal(summaryBefore.count - summaryAfter.count, 1);
  assert.equal(Number(summaryBefore.paid) - Number(summaryAfter.paid), 60000);
  assert.equal(
    (await req(`products/${p.id}/stock-movements`))[0].resulting_stock,
    21,
  );
  const rows = await readAllSales(req);
  assert.equal(rows.find((x) => x.id === s.id).status, "annulled");
  assert.equal(rows.find((x) => x.id === s.id).pending, "0");
  assert.equal(rows.find((x) => x.id === other.id).paid, "40000");
  assert.equal(
    (await req("cash/accounts")).find((x) => x.id === a.id).balance,
    "40000",
  );
  assert.equal((await req(`customers/${c.id}`)).sold, "40000");
  assert.equal(
    (await req("customers")).find((x) => x.id === c.id).sold,
    "40000",
  );
  assert.equal((await req(`customers/${c.id}/ledger`)).items[0].balance, "0");
  await req(
    `sales/${s.id}/payments`,
    { ...pay, amount: "1", request_key: randomUUID() },
    "POST",
    400,
  );
  await req(`sales/${s.id}/annul/preview`, {}, "POST", 400);
  assert.equal((await req(`sales/${s.id}/corrections`))[0].kind, "annul");
});

test("changed promo restores recorded components; stale stock, rollback and concurrency are safe", async () => {
  const { execFileSync } = await import("node:child_process");
  const database = process.env.TEST_ANNUL_DATABASE;
  if (!database || !/^[a-z0-9_]+_test$/.test(database))
    throw Error("TEST_ANNUL_DATABASE must match disposable API");
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
      database,
      "-c",
      text,
    ]);
  const c = await req("customers", { name: "Promo anular " + Date.now() });
  const p = await req("products", {
    name: "Chocolate " + Date.now(),
    selling_price: "100",
  });
  const other = await req("products", {
    name: "Vainilla " + Date.now(),
    selling_price: "100",
  });
  await req(`products/${p.id}/stock`, { quantity: 5 }, "PUT", 200);
  await req(`products/${other.id}/stock`, { quantity: 9 }, "PUT", 200);
  const kit = await req("products", {
    name: "Promo histórica " + Date.now(),
    kind: "kit",
    components: [{ product_id: p.id, quantity: 2 }],
    kit_pricing_mode: "final",
    selling_price: "190",
  });
  const sale = await req("sales", {
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: kit.id, quantity: 2, unit_price: "190" }],
    request_key: randomUUID(),
  });
  await req(
    `products/${kit.id}`,
    {
      name: "Promo modificada",
      components: [{ product_id: other.id, quantity: 3 }],
    },
    "PUT",
    200,
  );
  await req(`products/${p.id}/stock`, { quantity: 12 }, "PUT", 200);
  sql(`UPDATE products SET archived=true WHERE id=${p.id}`);
  const preview = await req(`sales/${sale.id}/annul/preview`, {});
  assert.equal(preview.stock.length, 1);
  assert.equal(preview.stock[0].id, p.id);
  assert.equal(preview.stock[0].after, 16);
  // A stock change after preview cannot overwrite a manual correction.
  sql(`UPDATE products SET own_stock=13 WHERE id=${p.id}`);
  await req(
    `sales/${sale.id}/annul`,
    { preview_token: preview.preview_token, request_key: randomUUID() },
    "POST",
    409,
  );
  const current = await req(`sales/${sale.id}/annul/preview`, {});
  assert.equal(current.stock[0].after, 17);
  sql(
    "CREATE OR REPLACE FUNCTION annul_fail_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER annul_fail BEFORE INSERT ON sale_corrections FOR EACH ROW EXECUTE FUNCTION annul_fail_test();",
  );
  try {
    await req(
      `sales/${sale.id}/annul`,
      { preview_token: current.preview_token, request_key: randomUUID() },
      "POST",
      500,
    );
  } finally {
    sql(
      "DROP TRIGGER annul_fail ON sale_corrections; DROP FUNCTION annul_fail_test();",
    );
  }
  const unchanged = await req(`sales/${sale.id}/annul/preview`, {});
  assert.equal(unchanged.stock[0].before, 13);
  assert.equal((await req(`sales/${sale.id}/corrections`)).length, 0);
  const responses = await Promise.all(
    [1, 2].map(() =>
      fetch(base + `/api/sales/${sale.id}/annul`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preview_token: unchanged.preview_token,
          request_key: randomUUID(),
        }),
      }),
    ),
  );
  assert.deepEqual(responses.map((x) => x.status).sort(), [201, 409]);
  const historical = (await readAllSales(req)).find((x) => x.id === sale.id);
  assert.equal(historical.items[0].components[0].product_id, p.id);
  assert.equal(historical.items[0].components[0].quantity, 4);
  assert.equal(historical.status, "annulled");
  const ledger = await req(`customers/${c.id}/ledger`);
  assert.equal(ledger.items[0].balance, "0");
  assert.match(ledger.items[0].concept, /anulada/);
  assert.equal((await req(`customers/${c.id}`)).sale_count, 0);
  await req(`customers/${c.id}/payments/preview`, { amount: "1" }, "POST", 400);
  const fresh = await req("sales", {
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: other.id, quantity: 1, unit_price: "100" }],
    request_key: randomUUID(),
  });
  const stale = await req(`sales/${fresh.id}/annul/preview`, {});
  const account = await req("cash/accounts", {
    name: "Concurrencia " + Date.now(),
    currency: "ARS",
    opening_balance: "0",
  });
  await req(`sales/${fresh.id}/payments`, {
    account_id: account.id,
    amount: "50",
    occurred_on: "2026-10-21",
    request_key: randomUUID(),
  });
  await req(
    `sales/${fresh.id}/annul`,
    { preview_token: stale.preview_token, request_key: randomUUID() },
    "POST",
    409,
  );
});
