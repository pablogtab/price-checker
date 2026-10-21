import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readAllSales } from "../helpers/sales.mjs";
const base = process.env.TEST_API_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Local disposable API required");
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
test("unknown stock starts at zero for sale, retry, substitution and annulment", async () => {
  const c = await req("customers", { name: "Stock cero " + Date.now() });
  const p = await req("products", {
    name: "Sin recuento " + Date.now(),
    selling_price: "100",
  });
  const other = await req("products", {
    name: "Reemplazo sin recuento " + Date.now(),
    selling_price: "300",
  });
  assert.equal(
    (await req("products")).find((x) => x.id === p.id).own_stock,
    null,
  );
  const body = {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: p.id, quantity: 2 }],
  };
  const sale = await req("sales", body);
  assert.match(sale.warnings.join(" "), /stock actual 0, queda -2/);
  assert.equal(
    (await req("products")).find((x) => x.id === p.id).own_stock,
    -2,
  );
  await req("sales", body);
  assert.equal(
    (await req("products")).find((x) => x.id === p.id).own_stock,
    -2,
  );
  const row = (await readAllSales(req)).find((x) => x.id === sale.id);
  assert.equal(row.items[0].components[0].previous_stock, 0);
  assert.equal(row.items[0].components[0].resulting_stock, -2);
  const edit = {
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: other.id, quantity: 3 }],
  };
  const preview = await req(`sales/${sale.id}/edit/preview`, edit);
  assert.equal(preview.stock.find((x) => x.product_id === other.id).before, 0);
  assert.equal(preview.stock.find((x) => x.product_id === other.id).after, -3);
  await req(`sales/${sale.id}/edits`, {
    ...edit,
    preview_token: preview.preview_token,
    request_key: randomUUID(),
  });
  const products = await req("products");
  assert.equal(products.find((x) => x.id === p.id).own_stock, 0);
  assert.equal(products.find((x) => x.id === other.id).own_stock, -3);
  const annul = await req(`sales/${sale.id}/annul/preview`, {});
  await req(`sales/${sale.id}/annul`, {
    preview_token: annul.preview_token,
    request_key: randomUUID(),
  });
  assert.equal(
    (await req("products")).find((x) => x.id === other.id).own_stock,
    0,
  );
});
