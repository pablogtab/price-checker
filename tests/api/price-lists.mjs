import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.TEST_API_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Disposable local API required");
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
test("independent persistent lists preview current selling prices and omit unavailable products", async () => {
  const p = await req("products", {
    name: "Whey Chocolate",
    selling_price: "23500",
  });
  await req(`products/${p.id}/stock`, { quantity: 2 }, "PUT");
  const no = await req("products", { name: "Sin stock", selling_price: "900" });
  const list = await req("price-lists", {
    title: "Disponibles",
    product_ids: [p.id, no.id, p.id],
  });
  assert.deepEqual((await req(`price-lists/${list.id}`)).product_ids, [
    p.id,
    no.id,
  ]);
  const other = await req("price-lists", { title: "Otra", product_ids: [] });
  const preview = await req(`price-lists/${list.id}/preview`, {});
  assert.match(preview.text, /\$\s?23\.500,00/);
  assert.doesNotMatch(preview.text, /^Disponible(?=:|$)/m);
  assert.equal(preview.items[0].price, "23500");
  assert.equal(preview.omissions[0].product_id, no.id);
  assert.ok(!preview.text.includes("Sin stock"));
  await req(
    `products/${p.id}/selling-price`,
    { selling_price: "24000" },
    "PUT",
  );
  assert.match(
    (await req(`price-lists/${list.id}/preview`, {})).text,
    /24\.000,00/,
  );
  await req(
    `price-lists/${list.id}`,
    { title: "Nuevo título", product_ids: [no.id] },
    "PUT",
  );
  assert.deepEqual((await req(`price-lists/${other.id}`)).product_ids, []);
  await req(
    `price-lists/${list.id}`,
    { title: "", product_ids: [p.id] },
    "PUT",
    400,
  );
  assert.equal((await req(`price-lists/${list.id}`)).title, "Nuevo título");
  await req(
    "price-lists",
    { title: "Invalid", product_ids: [999999999] },
    "POST",
    400,
  );
});
test("preview explains zero negative unknown zero-price and archived omissions without leaking internals", async () => {
  const ids = [];
  for (const [name, price, stock] of [
    ["Cero", "100", 0],
    ["Desconocido", "100", null],
    ["Gratis", "0", 3],
    ["Archivado", "100", 3],
  ]) {
    const p = await req("products", { name, selling_price: price });
    ids.push(p.id);
    if (stock !== null)
      await req(`products/${p.id}/stock`, { quantity: stock }, "PUT");
  }
  const list = await req("price-lists", { title: "Control", product_ids: ids });
  await req(`products/${ids[3]}`, {}, "DELETE", 200);
  const before = await req("products");
  const preview = await req(`price-lists/${list.id}/preview`, {});
  assert.equal(preview.text, "");
  assert.equal(preview.items.length, 0);
  assert.equal(preview.omissions.length, 4);
  assert.match(preview.omissions[3].reason, /archivado|no encontrado/);
  assert.deepEqual(await req("products"), before);
});
