import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.TEST_API_URL;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Local API required");
async function req(path, body, method = "POST", status) {
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
  assert.equal(
    r.status,
    status ?? (body === undefined ? 200 : method === "POST" ? 201 : 200),
    JSON.stringify(v),
  );
  return v;
}
test("presentation price updates every flavor and new flavors inherit it", async () => {
  const group = "Pricing " + Date.now();
  const a = await req("products", {
    name: "Chocolate",
    variant_group: group,
    selling_price: "1234.56",
    code: "000123",
    barcode: "00000009",
  });
  const b = await req("products", {
    name: "Banana",
    variant_group: group,
    selling_price: "9999",
  });
  assert.equal(b.selling_price, "1234.56");
  assert.equal(a.presentation_id, b.presentation_id);
  await req(
    `products/${a.id}/selling-price`,
    { selling_price: "2345.67" },
    "PUT",
  );
  let all = await req("products");
  assert.equal(all.find((p) => p.id === b.id).selling_price, "2345.67");
  const c = await req("products", {
    name: "Vanilla",
    variant_group: group,
    selling_price: "1",
  });
  assert.equal(c.selling_price, "2345.67");
  await Promise.all([
    req(`products/${a.id}/selling-price`, { selling_price: "3000.01" }, "PUT"),
    req(`products/${b.id}/selling-price`, { selling_price: "4000.02" }, "PUT"),
  ]);
  all = (await req("products")).filter((p) => p.variant_group === group);
  assert.equal(new Set(all.map((p) => p.selling_price)).size, 1);
  assert.equal(all.find((p) => p.id === a.id).code, "000123");
  const moved = await req("products", { name: "Moved", selling_price: "70" });
  const result = await req(
    `products/${moved.id}`,
    { name: "Moved", variant_group: group, selling_price: "70" },
    "PUT",
  );
  assert.equal(result.selling_price, all[0].selling_price);
  const presentations = await req("presentations");
  assert.equal(
    presentations.find((p) => p.id === a.presentation_id).variants.length,
    4,
  );
});
test("legacy discrepancies stay unresolved until an explicit common price is chosen", async () => {
  const { Client } = await import("pg");
  const url = process.env.TEST_GROUP_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw Error("Disposable database required");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  let pending;
  try {
    const group = "Legacy " + Date.now();
    const {
      rows: [p],
    } = await pg.query(
      "INSERT INTO presentations(variant_group) VALUES($1) RETURNING id",
      [group],
    );
    await pg.query(
      "INSERT INTO products(name,variant_group,selling_price,position,presentation_id) VALUES('Legacy chocolate',$1,100,1000,$2),('Legacy banana',$1,120,1001,$2)",
      [group, p.id],
    );
    pending = (await req("presentations")).find((x) => x.id === p.id);
  } finally {
    await pg.end();
  }
  assert.ok(pending, "migration fixture has a legacy inconsistent group");
  const before = pending.variants.map((p) => p.selling_price);
  assert.equal(new Set(before).size, 2);
  await req(
    `products/${pending.variants[0].id}/selling-price`,
    { selling_price: "555" },
    "PUT",
    400,
  );
  await req(
    `presentations/${pending.id}/price`,
    { catalog_price: "4567.89" },
    "PUT",
  );
  const after = (await req("presentations")).find((p) => p.id === pending.id);
  assert.equal(after.catalog_price, "4567.89");
  assert.ok(after.variants.every((p) => p.selling_price === "4567.89"));
});
test("full editing updates the common price while negotiated sale history and inventory remain unchanged", async () => {
  const group = "History " + Date.now();
  const a = await req("products", {
    name: "History chocolate",
    variant_group: group,
    selling_price: "100.25",
    code: "00001",
    barcode: "00000007",
  });
  const b = await req("products", {
    name: "History banana",
    variant_group: group,
    selling_price: "100.25",
  });
  await req(`products/${a.id}/stock`, { quantity: 8 }, "PUT");
  const customer = await req("customers", { name: "Historical customer" });
  const sale = await req("sales", {
    request_key: crypto.randomUUID(),
    sold_on: "2026-10-29",
    customer_id: customer.id,
    items: [{ product_id: a.id, quantity: 2, unit_price: "77.15" }],
  });
  const before = (await req("sales")).find((s) => s.id === sale.id);
  assert.equal(before.total, "154.3");
  const edited = await req(
    `products/${b.id}`,
    {
      name: "History banana edited",
      selling_price: "200.75",
      variant_group: group,
    },
    "PUT",
  );
  assert.equal(edited.selling_price, "200.75");
  const all = await req("products");
  assert.equal(all.find((p) => p.id === a.id).selling_price, "200.75");
  assert.equal(all.find((p) => p.id === a.id).own_stock, 6);
  assert.equal(all.find((p) => p.id === a.id).barcode, "00000007");
  const after = (await req("sales")).find((s) => s.id === sale.id);
  assert.deepEqual(after, before);
  const second = await req("sales", {
    request_key: crypto.randomUUID(),
    sold_on: "2026-10-29",
    customer_id: customer.id,
    items: [{ product_id: a.id, quantity: 1, unit_price: "50.05" }],
  });
  assert.equal(
    (await req("sales")).find((s) => s.id === second.id).total,
    "50.05",
  );
});
