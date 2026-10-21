import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw new Error("Use an isolated test API and E2E_ALLOW_FIXTURES=1");
async function request(path, body, method = "POST", status = undefined) {
  const r = await fetch(
    `${base}/api/${path}`,
    body === undefined
      ? {}
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  assert.equal(
    status === undefined ? r.ok : r.status === status,
    true,
    `${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
async function product(price = "10") {
  const p = await request("products", {
    name: `Discount ${randomUUID()}`,
    selling_price: price,
  });
  await request(`products/${p.id}/stock`, { quantity: 100 }, "PUT");
  return p;
}
async function fixture() {
  const p = await product();
  const c = await request("customers", { name: `Discount ${randomUUID()}` });
  return { p, c };
}
const sale = (p, c, discount, extra = {}) => ({
  sold_on: "2026-10-21",
  customer_id: c?.id,
  request_key: randomUUID(),
  items: [{ product_id: p.id, quantity: 3, unit_price: "10" }],
  discount,
  ...extra,
});
test("global ARS discount is authoritative and preserves line quantities and base prices", async () => {
  const { p, c } = await fixture();
  const result = await request(
    "sales",
    sale(p, c, { mode: "amount", value: "0.01" }),
  );
  const saved = (await request("sales")).find((s) => s.id === result.id);
  assert.equal(saved.total, "29.99");
  assert.equal(saved.subtotal, "30");
  assert.equal(saved.discount_amount, "0.01");
  assert.equal(saved.discount_mode, "amount");
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].quantity, 3);
  assert.equal(saved.items[0].unit_price, "10");
  assert.equal(saved.items[0].total, "29.99");
  assert.equal(saved.pending, "29.99");
});
test("percent discount allocates indivisible cents across lines and uses discounted debt and cash", async () => {
  const { p, c } = await fixture();
  const q = await product("0.01");
  const account = await request("cash/accounts", {
    name: `Discount cash ${randomUUID()}`,
    currency: "ARS",
    opening_balance: "0",
  });
  const body = sale(
    p,
    c,
    { mode: "percent", value: "50" },
    {
      items: [
        { product_id: p.id, quantity: 3, unit_price: "0.01" },
        { product_id: q.id, quantity: 2, unit_price: "0.01" },
      ],
      payment: { account_id: account.id, amount: "0.01" },
    },
  );
  const result = await request("sales", body);
  await request("sales", body);
  const saved = (await request("sales")).find((s) => s.id === result.id);
  assert.equal(saved.subtotal, "0.05");
  assert.equal(saved.discount_amount, "0.03");
  assert.equal(saved.total, "0.02");
  assert.deepEqual(
    saved.items.map((i) => [i.quantity, i.total, i.discount_amount]),
    [
      [3, "0.01", "0.02"],
      [2, "0.01", "0.01"],
    ],
  );
  assert.equal(saved.paid, "0.01");
  assert.equal(saved.pending, "0.01");
  assert.equal(
    (await request("cash/accounts")).find((a) => a.id === account.id).balance,
    "0.01",
  );
  assert.equal(
    (await request("customers")).find((a) => a.id === c.id).balance,
    "0.01",
  );
});
test("full discount permits consumer final zero total without a zero cash receipt", async () => {
  const p = await product("20");
  const before = await request("cash/operations");
  const result = await request(
    "sales",
    sale(p, null, { mode: "percent", value: "100" }),
  );
  const saved = (await request("sales")).find((s) => s.id === result.id);
  assert.equal(saved.total, "0");
  assert.equal(saved.paid, "0");
  assert.equal(saved.pending, "0");
  assert.equal(saved.payments.length, 0);
  assert.equal(saved.items[0].quantity, 3);
  assert.deepEqual(await request("cash/operations"), before);
  await request(
    "sales",
    sale(
      p,
      null,
      { mode: "percent", value: "100" },
      { payment: { account_id: 1, amount: "0" } },
    ),
    "POST",
    400,
  );
});
test("invalid discount cannot change stock and previously recorded sales remain unchanged", async () => {
  const { p, c } = await fixture();
  const recorded = await request("sales", sale(p, c, undefined));
  const before = (await request("sales")).find((s) => s.id === recorded.id);
  for (const discount of [
    { mode: "amount", value: "-1" },
    { mode: "amount", value: "30.01" },
    { mode: "percent", value: "100.01" },
    { mode: "percent", value: "-1" },
    { mode: "amount", value: "0.001" },
    { mode: "bad", value: "1" },
    { mode: "amount", value: "NaN" },
  ])
    await request("sales", sale(p, c, discount), "POST", 400);
  const after = (await request("sales")).find((s) => s.id === recorded.id);
  assert.deepEqual(after, before);
  assert.equal(
    (await request("products")).find((x) => x.id === p.id).own_stock,
    97,
  );
  assert.equal(after.total, "30");
  assert.equal(after.subtotal, "30");
  assert.equal(after.discount_amount, "0");
});
test("full and partial receipt validation uses the discounted total", async () => {
  const { p, c } = await fixture();
  const account = await request("cash/accounts", {
    name: `Full discount cash ${randomUUID()}`,
    currency: "ARS",
    opening_balance: "0",
  });
  await request(
    "sales",
    sale(
      p,
      c,
      { mode: "amount", value: "10" },
      { payment: { account_id: account.id, amount: "20.01" } },
    ),
    "POST",
    400,
  );
  const result = await request(
    "sales",
    sale(
      p,
      c,
      { mode: "amount", value: "10" },
      { payment: { account_id: account.id, amount: "20" } },
    ),
  );
  const saved = (await request("sales")).find((s) => s.id === result.id);
  assert.equal(saved.total, "20");
  assert.equal(saved.paid, "20");
  assert.equal(saved.pending, "0");
  assert.equal(
    (await request("cash/accounts")).find((a) => a.id === account.id).balance,
    "20",
  );
});
test("promo rounding precedes the global discount and preserves component quantities", async () => {
  const p = await product("1050");
  const c = await request("customers", {
    name: `Promo discount ${randomUUID()}`,
  });
  const kit = await request("products", {
    name: `Promo ${randomUUID()}`,
    kind: "kit",
    kit_pricing_mode: "discount",
    kit_discount_percent: "10",
    components: [{ product_id: p.id, quantity: 2 }],
  });
  const result = await request("sales", {
    sold_on: "2026-10-21",
    customer_id: c.id,
    request_key: randomUUID(),
    items: [{ product_id: kit.id, quantity: 3 }],
    discount: { mode: "percent", value: "10" },
  });
  const saved = (await request("sales")).find((s) => s.id === result.id);
  assert.equal(saved.subtotal, "5700");
  assert.equal(saved.discount_amount, "570");
  assert.equal(saved.total, "5130");
  assert.equal(saved.items[0].unit_price, "1900");
  assert.equal(saved.items[0].quantity, 3);
  assert.equal(saved.items[0].components[0].quantity, 6);
  assert.equal(
    (await request("products")).find((x) => x.id === p.id).own_stock,
    94,
  );
});
