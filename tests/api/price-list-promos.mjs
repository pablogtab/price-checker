import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const { Client } = createRequire(import.meta.url)("pg");
const base = process.env.TEST_API_URL,
  url = process.env.TEST_ORDER_DATABASE_URL;
if (
  !base ||
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !url ||
  !new URL(url).pathname.endsWith("_test")
)
  throw Error("Explicit disposable local API and _test database required");
async function request(path, body, method = "POST") {
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
  assert.ok(r.ok, await r.clone().text());
  return r.json();
}
test("promos share demand, constrain flavors, round eligible prices and require both order permissions", async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const group = "Promo test " + Date.now();
    const a = await request("products", {
        name: "Promo test Chocolate",
        variant_group: group,
        selling_price: "1000",
      }),
      b = await request("products", {
        name: "Promo test Banana",
        variant_group: group,
        selling_price: "1020",
      });
    await request(`products/${a.id}/stock`, { quantity: 1 }, "PUT");
    await request(`products/${b.id}/stock`, { quantity: 1 }, "PUT");
    const {
      rows: [kit],
    } = await c.query(
      "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,kit_discount_percent,position) VALUES('Promo flow','kit',2000,'discount',0,999) RETURNING id",
    );
    await c.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,$3)",
      [kit.id, a.id, group],
    );
    const list = await request("price-lists", {
      title: "Promos",
      product_ids: [a.id, kit.id],
    });
    const snapshot = async () =>
      (
        await c.query(
          "SELECT (SELECT jsonb_agg(jsonb_build_array(id,own_stock,selling_price)) FROM products) products,(SELECT count(*)::int FROM sales) sales,(SELECT count(*)::int FROM cash_operations) cash,(SELECT count(*)::int FROM stock_movements) moves,(SELECT count(*)::int FROM refresh_runs) refresh",
        )
      ).rows[0];
    const preview = async () => {
      const before = await snapshot();
      const value = await request(`price-lists/${list.id}/preview`, {});
      assert.deepEqual(await snapshot(), before);
      return value;
    };
    let v = await preview();
    assert.equal(v.items.find((x) => x.product_id === kit.id)?.price, "2000");
    assert.match(v.text, /máximo 1 en toda la promo/);
    assert.ok(
      v.text.indexOf("Promo flow") > v.text.indexOf("*" + group + " —"),
    );
    await request(`products/${a.id}/stock`, { quantity: 2 }, "PUT");
    await c.query("UPDATE products SET selling_price=1200 WHERE id=$1", [b.id]);
    v = await preview();
    assert.match(
      v.omissions.find((x) => x.product_id === kit.id)?.reason,
      /precio variable/,
    );
    await c.query(
      "UPDATE products SET kit_pricing_mode='final',selling_price=1900 WHERE id=$1",
      [kit.id],
    );
    v = await preview();
    assert.equal(v.items.find((x) => x.product_id === kit.id)?.price, "1900");
    await c.query("DELETE FROM product_components WHERE kit_id=$1", [kit.id]);
    await c.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,NULL),($1,$3,3,$4)",
      [kit.id, a.id, b.id, group],
    );
    v = await preview();
    assert.match(
      v.omissions.find((x) => x.product_id === kit.id)?.reason,
      /insuficientes/,
    );
    const {
      rows: [provider],
    } = await c.query(
      "INSERT INTO providers(name,last_success_at) VALUES($1,now()-interval '25 hours') RETURNING id",
      [group],
    );
    const {
      rows: [offer],
    } = await c.query(
      "INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES($1,'pack','Pack','Brand','Other','ARS',10,10,1,true,false,now()) RETURNING id",
      [provider.id],
    );
    await c.query(
      "INSERT INTO product_links(product_id,provider_id,kit_item_id,kit_units) VALUES($1,$2,$3,2)",
      [a.id, provider.id, offer.id],
    );
    await c.query(
      "UPDATE products SET price_list_order_allowed=true WHERE id=$1",
      [kit.id],
    );
    v = await preview();
    assert.ok(v.omissions.find((x) => x.product_id === kit.id));
    await c.query(
      "UPDATE products SET price_list_order_allowed=true WHERE id=$1",
      [a.id],
    );
    v = await preview();
    assert.equal(
      v.items.find((x) => x.product_id === kit.id)?.availability,
      "order",
    );
    assert.equal(v.requires_confirmation, true);
    assert.match(v.text, /Por encargo/);
    await c.query("UPDATE product_links SET kit_units=1 WHERE product_id=$1", [
      a.id,
    ]);
    v = await preview();
    assert.ok(v.omissions.find((x) => x.product_id === kit.id));
    // Shared supplier stock has two physical packs, not two independent pools.
    await c.query(
      "UPDATE products SET own_stock=0,price_list_order_allowed=true WHERE id=ANY($1::int[])",
      [[a.id, b.id]],
    );
    await c.query(
      "INSERT INTO product_links(product_id,provider_id,kit_item_id,kit_units) VALUES($1,$2,$3,16)",
      [b.id, provider.id, offer.id],
    );
    await c.query("UPDATE product_links SET kit_units=1 WHERE product_id=$1", [
      a.id,
    ]);
    await c.query("UPDATE supplier_items SET stock=2 WHERE id=$1", [offer.id]);
    await c.query("DELETE FROM product_components WHERE kit_id=$1", [kit.id]);
    await c.query(
      "INSERT INTO product_components(kit_id,product_id,quantity) VALUES($1,$2,1),($1,$3,1)",
      [kit.id, a.id, b.id],
    );
    v = await preview();
    assert.equal(
      v.items.find((x) => x.product_id === kit.id)?.availability,
      "order",
    );
    await c.query("UPDATE supplier_items SET stock=1 WHERE id=$1", [offer.id]);
    v = await preview();
    assert.ok(v.omissions.find((x) => x.product_id === kit.id));
    // A can use its alternative T, leaving shared S for B.
    const {
      rows: [alternative],
    } = await c.query(
      "INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES($1,'alternative','Alternative','Brand','Other','ARS',10,10,1,false,false,now()) RETURNING id",
      [provider.id],
    );
    await c.query(
      "UPDATE product_links SET individual_item_id=$2,individual_units=1 WHERE product_id=$1",
      [a.id, alternative.id],
    );
    v = await preview();
    assert.equal(
      v.items.find((x) => x.product_id === kit.id)?.availability,
      "order",
    );
    await c.query(
      "DELETE FROM product_components WHERE kit_id=$1 AND product_id=$2",
      [kit.id, b.id],
    );
    v = await preview();
    assert.equal(
      v.items.find((x) => x.product_id === kit.id)?.availability,
      "order",
    );
  } finally {
    await c.end();
  }
});
