import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { Client } = require("pg");
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
test("shared order policy and supplier alternatives control export; stale data requires preview-specific confirmation", async () => {
  const p = await request("products", {
    name: "Encargo Chocolate",
    selling_price: "23500",
  });
  const policy = await request("price-list-order-policy");
  await request(
    "price-list-order-policy",
    {
      days: 9,
      allowed_product_ids: [
        ...policy.products.filter((p) => p.allowed).map((p) => p.id),
        p.id,
      ],
    },
    "PUT",
  );
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const {
      rows: [provider],
    } = await c.query(
      "INSERT INTO providers(name,last_success_at) VALUES($1,now()) RETURNING id",
      ["Orders " + p.id],
    );
    const {
      rows: [offer],
    } = await c.query(
      `INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES($1,'one','Offer','Brand','Other','ARS',100,100,3,false,false,now()) RETURNING id`,
      [provider.id],
    );
    await c.query(
      "INSERT INTO product_links(product_id,provider_id,individual_item_id,individual_units) VALUES($1,$2,$3,1)",
      [p.id, provider.id, offer.id],
    );
    const list = await request("price-lists", {
      title: "Pedidos",
      product_ids: [p.id],
    });
    let preview = await request(`price-lists/${list.id}/preview`, {});
    assert.equal(preview.items[0]?.availability, "order");
    assert.match(preview.text, /9 días/);
    assert.equal(preview.requires_confirmation, false);
    await c.query(
      "UPDATE providers SET last_success_at=now()-interval '25 hours' WHERE id=$1",
      [provider.id],
    );
    preview = await request(`price-lists/${list.id}/preview`, {});
    assert.equal(preview.requires_confirmation, true);
    assert.equal(preview.providers[0].warning, true);
    const confirm = async (snapshot, accepted, status = 201) => {
      const response = await fetch(
        base + `/api/price-lists/${list.id}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            preview_id: snapshot.preview_id,
            accept_stale: accepted,
          }),
        },
      );
      assert.equal(response.status, status, await response.clone().text());
      return response.json();
    };
    await confirm(preview, false, 400);
    assert.equal((await confirm(preview, true)).text, preview.text);
    const prior = preview;
    preview = await request(`price-lists/${list.id}/preview`, {});
    await confirm(prior, true, 409);
    await request(
      `price-lists/${list.id}`,
      { title: "Edited", product_ids: [p.id] },
      "PUT",
    );
    await confirm(preview, true, 409);
    preview = await request(`price-lists/${list.id}/preview`, {});
    const currentPolicy = await request("price-list-order-policy");
    await request(
      "price-list-order-policy",
      {
        days: 10,
        allowed_product_ids: currentPolicy.products
          .filter((x) => x.allowed)
          .map((x) => x.id),
      },
      "PUT",
    );
    await confirm(preview, true, 409);

    await c.query(
      "UPDATE providers SET last_success_at=now()-interval '1 hour' WHERE id=$1",
      [provider.id],
    );
    await c.query(
      "INSERT INTO refresh_runs(provider_id,status,trigger,finished_at) VALUES($1,'session_required','manual',now())",
      [provider.id],
    );
    preview = await request(`price-lists/${list.id}/preview`, {});
    assert.equal(preview.requires_confirmation, true);
    await c.query(
      "INSERT INTO refresh_runs(provider_id,status,trigger) VALUES($1,'running','manual')",
      [provider.id],
    );
    preview = await request(`price-lists/${list.id}/preview`, {});
    assert.equal(preview.requires_confirmation, false);
    await c.query("UPDATE supplier_items SET available=false WHERE id=$1", [
      offer.id,
    ]);
    preview = await request(`price-lists/${list.id}/preview`, {});
    assert.equal(preview.items.length, 0);
    await c.query("UPDATE supplier_items SET available=true WHERE id=$1", [
      offer.id,
    ]);
    await c.query("UPDATE supplier_items SET stock=0 WHERE id=$1", [offer.id]);
    preview = await request(`price-lists/${list.id}/preview`, {});
    assert.equal(preview.items.length, 0);
    assert.match(preview.omissions[0].reason, /stock positivo/);
    await request(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    preview = await request(`price-lists/${list.id}/preview`, {});
    assert.equal(preview.items[0].availability, "available");
    assert.equal(preview.requires_confirmation, false);
  } finally {
    await c.end();
  }
});
test(
  "controlled clock: exactly 24h is fresh, next millisecond is stale",
  { skip: !process.env.TEST_ORDER_FIXED_CLOCK },
  async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      const {
        rows: [p],
      } = await c.query(
        "SELECT p.id,l.provider_id FROM products p JOIN product_links l ON l.product_id=p.id ORDER BY p.id DESC LIMIT 1",
      );
      await c.query(
        "UPDATE products SET own_stock=0,price_list_order_allowed=true WHERE id=$1",
        [p.id],
      );
      await c.query(
        "UPDATE supplier_items SET stock=3,available=true WHERE provider_id=$1",
        [p.provider_id],
      );
      await c.query("DELETE FROM refresh_runs WHERE provider_id=$1", [
        p.provider_id,
      ]);
      const list = await request("price-lists", {
        title: "Boundary",
        product_ids: [p.id],
      });
      for (const [stamp, expected] of [
        ["2026-10-21T12:00:00.001Z", false],
        ["2026-10-21T12:00:00.000Z", false],
        ["2026-10-21T11:59:59.999Z", true],
      ]) {
        await c.query("UPDATE providers SET last_success_at=$1 WHERE id=$2", [
          stamp,
          p.provider_id,
        ]);
        const v = await request(`price-lists/${list.id}/preview`, {});
        assert.equal(v.requires_confirmation, expected, stamp);
      }
    } finally {
      await c.end();
    }
  },
);
