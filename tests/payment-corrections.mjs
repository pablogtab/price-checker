import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
const base = process.env.TEST_API_URL;
if (!base) throw Error("TEST_API_URL must point to disposable test API");
async function req(path, body, method = "POST", expected = 200) {
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
  assert.equal(r.status, expected, JSON.stringify(v));
  return v;
}
test("shared receipt correction affects only selected sale, previews and retries safely", async () => {
  const suffix = Date.now();
  const c = await req(
    "customers",
    { name: "Correcciones " + suffix },
    "POST",
    201,
  );
  const a = await req(
    "cash/accounts",
    { name: "Origen " + suffix, currency: "ARS", opening_balance: "0" },
    "POST",
    201,
  );
  const b = await req(
    "cash/accounts",
    { name: "Destino " + suffix, currency: "ARS", opening_balance: "0" },
    "POST",
    201,
  );
  const p = await req(
    "products",
    { name: "Corrección " + suffix, selling_price: "60000" },
    "POST",
    201,
  );
  await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT");
  async function sale(total) {
    return req(
      "sales",
      {
        customer_id: c.id,
        sold_on: "2026-10-21",
        items: [{ product_id: p.id, quantity: 1, unit_price: total }],
        request_key: randomUUID(),
      },
      "POST",
      201,
    );
  }
  const s1 = await sale("60000"),
    s2 = await sale("40000");
  const pay = { amount: "100000", account_id: a.id, occurred_on: "2026-10-21" };
  const preview = await req(
    `customers/${c.id}/payments/preview`,
    pay,
    "POST",
    201,
  );
  await req(
    `customers/${c.id}/payments`,
    { ...pay, preview_token: preview.token, request_key: randomUUID() },
    "POST",
    201,
  );
  let rows = await req("sales");
  const application = rows.find((s) => s.id === s1.id).payments[0];
  const edit = { amount: "50000", account_id: b.id, occurred_on: "2026-10-20" };
  const ep = await req(
    `sales/${s1.id}/payments/${application.id}/preview`,
    edit,
    "POST",
    201,
  );
  assert.equal(ep.after.pending, "10000");
  let accounts = await req("cash/accounts");
  assert.equal(accounts.find((x) => x.id === a.id).balance, "100000");
  const body = {
    ...edit,
    preview_token: ep.preview_token,
    request_key: randomUUID(),
  };
  const result = await req(
    `sales/${s1.id}/payments/${application.id}/corrections`,
    body,
    "POST",
    201,
  );
  assert.deepEqual(
    await req(
      `sales/${s1.id}/payments/${application.id}/corrections`,
      body,
      "POST",
      201,
    ),
    result,
  );
  rows = await req("sales");
  assert.equal(rows.find((s) => s.id === s1.id).pending, "10000");
  assert.equal(rows.find((s) => s.id === s2.id).paid, "40000");
  accounts = await req("cash/accounts");
  assert.equal(accounts.find((x) => x.id === a.id).balance, "40000");
  assert.equal(accounts.find((x) => x.id === b.id).balance, "50000");
  assert.equal(
    rows.find((s) => s.id === s1.id).payments[0].occurred_on,
    "2026-10-20",
  );
  const current = rows.find((s) => s.id === s1.id).payments[0];
  const path = `sales/${s1.id}/payments/${current.id}`;
  await req(path + "/preview", { ...edit, amount: "70000" }, "POST", 400);
  await req(path + "/preview", { ...edit, amount: "-1" }, "POST", 400);
  await req(path + "/preview", { ...edit, amount: "2.333" }, "POST", 400);
  const stale = await req(
    path + "/preview",
    { ...edit, amount: "45000" },
    "POST",
    201,
  );
  await req(
    `sales/${s1.id}/payments`,
    {
      amount: "1000",
      account_id: b.id,
      occurred_on: "2026-10-21",
      request_key: randomUUID(),
    },
    "POST",
    201,
  );
  await req(
    path + "/corrections",
    {
      ...edit,
      amount: "45000",
      preview_token: stale.preview_token,
      request_key: randomUUID(),
    },
    "POST",
    409,
  );
  const concurrent = await req(
    path + "/preview",
    { ...edit, amount: "45000" },
    "POST",
    201,
  );
  const requests = await Promise.all(
    [1, 2].map(() =>
      fetch(base + "/api/" + path + "/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...edit,
          amount: "45000",
          preview_token: concurrent.preview_token,
          request_key: randomUUID(),
        }),
      }),
    ),
  );
  assert.deepEqual(requests.map((r) => r.status).sort(), [201, 409]);
  const audits = await req(`sales/${s1.id}/corrections`);
  assert.equal(audits.length, 2);
  assert.equal(audits[0].before_state.amount, "50000");
  const valid = await req(
    path + "/preview",
    { ...edit, amount: "44000" },
    "POST",
    201,
  );
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
      "ventas_ticket6_test",
      "-c",
      text,
    ]);
  sql(
    "CREATE OR REPLACE FUNCTION correction_fail_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER correction_fail BEFORE INSERT ON sale_corrections FOR EACH ROW EXECUTE FUNCTION correction_fail_test();",
  );
  try {
    await req(
      path + "/corrections",
      {
        ...edit,
        amount: "44000",
        preview_token: valid.preview_token,
        request_key: randomUUID(),
      },
      "POST",
      500,
    );
  } finally {
    sql(
      "DROP TRIGGER correction_fail ON sale_corrections; DROP FUNCTION correction_fail_test();",
    );
  }
  assert.equal((await req("sales")).find((s) => s.id === s1.id).paid, "46000");
  const usd = await req(
    "cash/accounts",
    { name: "USD " + suffix, currency: "USD", opening_balance: "0" },
    "POST",
    201,
  );
  await req(path + "/preview", { ...edit, account_id: usd.id }, "POST", 400);
  const removal = await req(
    path + "/preview",
    { ...edit, amount: "0" },
    "POST",
    201,
  );
  await req(
    path + "/corrections",
    {
      ...edit,
      amount: "0",
      preview_token: removal.preview_token,
      request_key: randomUUID(),
    },
    "POST",
    201,
  );
  assert.equal((await req("sales")).find((s) => s.id === s1.id).paid, "1000");
  assert.equal(
    (await req("customers")).find((x) => x.id === c.id).balance,
    "59000",
  );
  assert.equal(
    (await req("products")).items?.find?.((x) => x.id === p.id)?.own_stock ??
      (await req("products")).find?.((x) => x.id === p.id)?.own_stock,
    8,
  );
});
