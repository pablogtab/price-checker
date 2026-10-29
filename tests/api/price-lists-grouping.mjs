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
test("selected flavors use the common presentation price without selecting new flavors", async () => {
  const ids = [];
  for (const [flavor, price, group] of [
    ["Chocolate", "1000", "Whey 2 lb"],
    ["Banana", "1000", "Whey 2 lb"],
    ["Vainilla", "1200", "Whey 2 lb"],
    ["Chocolate", "1000", "Whey 3 kg"],
  ]) {
    const p = await req("products", {
      name: group + " · " + flavor,
      variant_group: group,
      selling_price: price,
    });
    await req(`products/${p.id}/stock`, { quantity: 2 }, "PUT");
    ids.push(p.id);
  }
  const list = await req("price-lists", {
    title: "Agrupados",
    product_ids: ids,
  });
  const preview = await req(`price-lists/${list.id}/preview`, {});
  assert.match(
    preview.text,
    /Whey 2 lb — \$ 1\.000,00\*\nDisponible: Banana, Chocolate, Vainilla/,
  );
  assert.ok(!preview.text.includes("1.200,00"));
  assert.match(preview.text, /Whey 3 kg — \$ 1\.000,00/);
  const added = await req("products", {
    name: "Whey 2 lb · Frutilla",
    variant_group: "Whey 2 lb",
    selling_price: "1000",
  });
  await req(`products/${added.id}/stock`, { quantity: 2 }, "PUT");
  assert.deepEqual((await req(`price-lists/${list.id}`)).product_ids, ids);
  assert.ok(
    !(await req(`price-lists/${list.id}/preview`, {})).text.includes(
      "Frutilla",
    ),
  );
});
test("preferred linked brand orders groups before unbranded with stable exact sanitized text", async () => {
  const { Client } = await import("pg");
  const url = process.env.TEST_GROUP_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw Error("Disposable PG fixture database required");
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const products = [];
    for (const name of ["ZZZ Unknown", "AAA Linked", "BBB Linked"]) {
      const p = await req("products", { name, selling_price: "500" });
      await req(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
      products.push(p);
    }
    const provider = (
      await db.query("INSERT INTO providers(name) VALUES($1) RETURNING id", [
        "Brands " + Date.now(),
      ])
    ).rows[0];
    for (const [index, brand] of [
      [1, "ZETA"],
      [2, "ALFA"],
    ]) {
      const item = (
        await db.query(
          "INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES($1,$2,'item',$3,'','ARS',1,1,1,false,false,now()) RETURNING id",
          [provider.id, String(index), brand],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO product_links(product_id,provider_id,individual_item_id) VALUES($1,$2,$3)",
        [products[index].id, provider.id, item.id],
      );
    }
    const list = await req("price-lists", {
      title: "Lista *clientes*",
      product_ids: products.map((p) => p.id),
    });
    const preview = await req(`price-lists/${list.id}/preview`, {});
    const date = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(preview.generated_at));
    assert.equal(
      preview.text,
      `*Lista clientes*\n${date}\n\n*BBB Linked — $ 500,00*\n\n*AAA Linked — $ 500,00*\n\n*ZZZ Unknown — $ 500,00*`,
    );
    await req(
      `price-lists/${list.id}`,
      { title: list.title, product_ids: products.map((p) => p.id).reverse() },
      "PUT",
    );
    assert.equal(
      (await req(`price-lists/${list.id}/preview`, {})).text,
      preview.text,
    );
  } finally {
    await db.end();
  }
});

test("single variants omit redundant availability labels and repeated product names", async () => {
  const ids = [];
  for (const [name, group] of [
    [
      "STAR Citrato De Magnesio 500mg X 60 Capsulas",
      "STAR Citrato De Magnesio 500mg X 60 Capsulas",
    ],
    ["Collagen FRUTOS ROJOS", null],
    ["Creatina 300 GR · NEUTRA", "Creatina 300 GR"],
  ]) {
    const p = await req("products", {
      name,
      variant_group: group,
      selling_price: "13500",
    });
    await req(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    ids.push(p.id);
  }
  const list = await req("price-lists", { title: "Simple", product_ids: ids });
  const preview = await req(`price-lists/${list.id}/preview`, {});
  assert.ok(!preview.text.includes("Disponible"));
  assert.equal(preview.text.split("STAR Citrato De Magnesio").length - 1, 1);
  assert.match(preview.text, /Creatina 300 GR — \$ 13\.500,00\*\nNEUTRA/);
});
