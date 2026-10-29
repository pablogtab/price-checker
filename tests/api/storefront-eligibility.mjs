import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "pg";
const base = process.env.TEST_API_URL,
  url = process.env.TEST_STOREFRONT_DATABASE_URL;
if (
  !base ||
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  new URL(url).hostname !== "127.0.0.1"
)
  throw Error("local disposable DB required");
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
test("shared manual permission and last successful individual or pack offers determine eligibility without public diagnostics", async () => {
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const p = await req("products", {
      name: "Eligibility " + Date.now(),
      selling_price: "1200",
    });
    const {
      rows: [provider],
    } = await pg.query(
      "INSERT INTO providers(name,last_success_at) VALUES($1,now()-interval '10 days') RETURNING id",
      ["Test " + Date.now()],
    );
    const {
      rows: [offer],
    } = await pg.query(
      "INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES($1,'individual','Test','Brand','Other','ARS',10,10,1,false,false,now()) RETURNING id",
      [provider.id],
    );
    await pg.query(
      "INSERT INTO product_links(product_id,provider_id,individual_item_id) VALUES($1,$2,$3)",
      [p.id, provider.id, offer.id],
    );
    const state = await req("storefront/draft");
    const draft = await req(
      "storefront/draft",
      {
        revision: state.revision,
        entries: [
          {
            presentationId: p.presentation_id,
            title: "Public eligibility",
            description: "",
            imageKey: null,
            variantIds: [p.id],
          },
        ],
      },
      "PUT",
    );
    await req("storefront/publish", { revision: draft.revision });
    assert.equal((await req("public/storefront/catalog")).items.length, 0);
    await req(`storefront/order-permission/${p.id}`, { allowed: true }, "PUT");
    assert.equal(
      (await req("price-list-order-policy")).products.find((x) => x.id === p.id)
        .allowed,
      true,
    );
    await req("storefront/publish", { revision: draft.revision });
    assert.equal(
      (await req("public/storefront/catalog")).items[0].price,
      "1200",
    );
    assert.match(
      JSON.stringify((await req("storefront/preview")).warnings),
      /catálogo/i,
    );
    await pg.query(
      "INSERT INTO refresh_runs(provider_id,status,trigger,finished_at) VALUES($1,'failed','manual',now())",
      [provider.id],
    );
    assert.equal((await req("public/storefront/catalog")).items.length, 1);
    assert.ok(
      !/provider|warning|stock|session|encargo/i.test(
        JSON.stringify(await req("public/storefront/catalog")),
      ),
    );
    for (const quantity of [null, 0, -3]) {
      await pg.query("UPDATE products SET own_stock=$1 WHERE id=$2", [
        quantity,
        p.id,
      ]);
      assert.equal((await req("public/storefront/catalog")).items.length, 1);
    }
    await pg.query("UPDATE supplier_items SET is_pack=true WHERE id=$1", [
      offer.id,
    ]);
    await pg.query(
      "UPDATE product_links SET kit_item_id=individual_item_id,individual_item_id=NULL,kit_units=6 WHERE product_id=$1",
      [p.id],
    );
    assert.equal((await req("public/storefront/catalog")).items.length, 1);
    for (const stock of [null, 0]) {
      await pg.query("UPDATE supplier_items SET stock=$1 WHERE id=$2", [
        stock,
        offer.id,
      ]);
      assert.equal((await req("public/storefront/catalog")).items.length, 0);
      assert.ok(Array.isArray(await req("products")));
    }
    await pg.query(
      "UPDATE supplier_items SET stock=1,available=false WHERE id=$1",
      [offer.id],
    );
    assert.equal((await req("public/storefront/catalog")).items.length, 0);
    await pg.query("UPDATE supplier_items SET available=true WHERE id=$1", [
      offer.id,
    ]);
    await pg.query("UPDATE providers SET last_success_at=NULL WHERE id=$1", [
      provider.id,
    ]);
    assert.equal((await req("public/storefront/catalog")).items.length, 0);
    await req(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    assert.equal((await req("public/storefront/catalog")).items.length, 1);
  } finally {
    await pg.end();
  }
});
test("promo explicitly selects each component flavors, has stable identity and one live price without stock capacities", async () => {
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const group = "Promo " + Date.now();
    const a = await req("products", {
      name: "Chocolate",
      variant_group: group,
      selling_price: "1050",
    });
    const b = await req("products", {
      name: "Banana",
      variant_group: group,
      selling_price: "1050",
    });
    const hidden = await req("products", {
      name: "Internal only",
      variant_group: group,
      selling_price: "1050",
    });
    for (const p of [a, b, hidden])
      await req(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    const {
      rows: [kit],
    } = await pg.query(
      "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,kit_discount_percent,position) VALUES('Two proteins','kit',1900,'discount',10,999) RETURNING id",
    );
    await pg.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,$3)",
      [kit.id, a.id, group],
    );
    const state = await req("storefront/draft");
    const entry = {
      kind: "promo",
      promoId: kit.id,
      title: "Promo dos proteínas",
      description: "Elegí cada unidad",
      imageKey: null,
      promoComponents: [{ componentId: a.id, variantIds: [a.id, b.id] }],
    };
    const draft = await req(
      "storefront/draft",
      { revision: state.revision, entries: [entry] },
      "PUT",
    );
    await req("storefront/publish", { revision: draft.revision });
    let detail = await req(`public/storefront/promos/${kit.id}`);
    assert.equal(detail.id, "promo-" + kit.id);
    assert.equal(detail.price, "1900");
    assert.deepEqual(detail.components, [
      {
        componentId: a.id,
        label: group,
        quantity: 2,
        variants: [
          { id: a.id, label: "Chocolate" },
          { id: b.id, label: "Banana" },
        ],
      },
    ]);
    assert.ok(!JSON.stringify(detail).includes("stock"));
    assert.ok(!JSON.stringify(detail).includes("capacity"));
    await req(
      `presentations/${a.presentation_id}/price`,
      { catalog_price: "1500" },
      "PUT",
    );
    assert.equal(
      (await req(`public/storefront/promos/${kit.id}`)).price,
      "2700",
    );
    await pg.query(
      "UPDATE products SET kit_pricing_mode='final',selling_price=2250 WHERE id=$1",
      [kit.id],
    );
    assert.equal(
      (await req(`public/storefront/promos/${kit.id}`)).price,
      "2250",
    );
    await pg.query("UPDATE products SET selling_price=1800 WHERE id=$1", [
      b.id,
    ]);
    assert.equal(
      (await req(`public/storefront/promos/${kit.id}`)).price,
      "2250",
    );
    await pg.query(
      "UPDATE products SET kit_pricing_mode='discount' WHERE id=$1",
      [kit.id],
    );
    await req(`public/storefront/promos/${kit.id}`, undefined, "GET", 404);
    await req("storefront/publish", { revision: draft.revision }, "POST", 400);
    await req(
      `presentations/${a.presentation_id}/price`,
      { catalog_price: "1500" },
      "PUT",
    );
    await req(`products/${b.id}/stock`, { quantity: 0 }, "PUT");
    detail = await req(`public/storefront/promos/${kit.id}`);
    assert.deepEqual(detail.components[0].variants, [
      { id: a.id, label: "Chocolate" },
    ]);
    assert.equal(detail.components[0].quantity, 2);
    await pg.query("UPDATE products SET archived=true WHERE id=$1", [kit.id]);
    await req(`public/storefront/promos/${kit.id}`, undefined, "GET", 404);
  } finally {
    await pg.end();
  }
});
test("promo without shared order permission keeps own-stock choices and excludes supplier-only choices", async () => {
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const group = "Mixed " + Date.now();
    const a = await req("products", {
        name: "Own",
        variant_group: group,
        selling_price: "1000",
      }),
      b = await req("products", {
        name: "Supplier",
        variant_group: group,
        selling_price: "1000",
      });
    await req(`products/${a.id}/stock`, { quantity: 1 }, "PUT");
    const {
      rows: [provider],
    } = await pg.query(
      "INSERT INTO providers(name,last_success_at) VALUES($1,now()) RETURNING id",
      [group],
    );
    const {
      rows: [offer],
    } = await pg.query(
      "INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES($1,'pack','Pack','Brand','Other','ARS',10,10,1,true,false,now()) RETURNING id",
      [provider.id],
    );
    await pg.query(
      "INSERT INTO product_links(product_id,provider_id,kit_item_id,kit_units) VALUES($1,$2,$3,6)",
      [b.id, provider.id, offer.id],
    );
    await req(`storefront/order-permission/${b.id}`, { allowed: true }, "PUT");
    const {
      rows: [kit],
    } = await pg.query(
      "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,kit_discount_percent,position,price_list_order_allowed) VALUES('Mixed kit','kit',2000,'final',0,999,true) RETURNING id",
    );
    await pg.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,3,$3)",
      [kit.id, a.id, group],
    );
    const state = await req("storefront/draft");
    const draft = await req(
      "storefront/draft",
      {
        revision: state.revision,
        entries: [
          {
            kind: "promo",
            promoId: kit.id,
            title: "Mixed promo",
            description: "",
            imageKey: null,
            promoComponents: [{ componentId: a.id, variantIds: [a.id, b.id] }],
          },
        ],
      },
      "PUT",
    );
    await req("storefront/publish", { revision: draft.revision });
    assert.equal(
      (await req(`public/storefront/promos/${kit.id}`)).components[0].variants
        .length,
      2,
    );
    await req(
      `storefront/order-permission/${kit.id}`,
      { allowed: false },
      "PUT",
    );
    assert.deepEqual(
      (await req(`public/storefront/promos/${kit.id}`)).components[0].variants,
      [{ id: a.id, label: "Own" }],
    );
    await req("storefront/publish", { revision: draft.revision });
  } finally {
    await pg.end();
  }
});
test("promo identity, category order and reusable gallery survive discovery and media publication together", async () => {
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const p = await req("products", {
      name: "Chocolate " + Date.now(),
      selling_price: "1000",
    });
    await req(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    const {
      rows: [kit],
    } = await pg.query(
      "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,kit_discount_percent,position) VALUES('Gallery kit','kit',1000,'final',0,999) RETURNING id",
    );
    await pg.query(
      "INSERT INTO product_components(kit_id,product_id,quantity) VALUES($1,$2,2)",
      [kit.id, p.id],
    );
    const sharp = (await import("sharp")).default;
    const image = await sharp({
      create: { width: 60, height: 90, channels: 3, background: "#ddeeaa" },
    })
      .png()
      .toBuffer();
    const asset = await req("media", {
      name: "Promo combined " + Date.now(),
      data: "data:image/png;base64," + image.toString("base64"),
    });
    const original = await req("storefront/draft");
    const common = {
      description: "Contenido propio",
      imageKey: null,
      categoryIds: ["promos-test"],
      brandId: "geva",
      gallery: [asset.id],
      coverMediaId: asset.id,
      variantImages: [],
    };
    const product = {
      ...common,
      presentationId: p.presentation_id,
      title: "Producto individual",
      variantIds: [p.id],
    };
    const promo = {
      ...common,
      kind: "promo",
      promoId: kit.id,
      title: "Promo combinada",
      promoComponents: [{ componentId: p.id, variantIds: [p.id] }],
    };
    let draft = await req(
      "storefront/draft",
      {
        revision: original.revision,
        entries: [product, promo],
        categories: [
          {
            id: "promos-test",
            name: "Promos",
            productIds: ["promo-" + kit.id, p.presentation_id],
          },
        ],
        brands: [{ id: "geva", name: "GEVA" }],
      },
      "PUT",
    );
    await req("storefront/publish", { revision: draft.revision });
    const detail = await req(`public/storefront/promos/${kit.id}`);
    assert.deepEqual(detail.brand, { id: "geva", name: "GEVA" });
    assert.deepEqual(detail.categoryIds, ["promos-test"]);
    assert.equal(
      detail.imageUrl,
      `/api/public/storefront/media/${asset.id}/desktop`,
    );
    assert.equal(detail.gallery.length, 1);
    assert.deepEqual(
      (await req("public/storefront/catalog?category=promos-test")).items.map(
        (x) => x.id,
      ),
      ["promo-" + kit.id, p.presentation_id],
    );
    assert.equal(
      (await req("public/storefront/catalog?q=chocolate")).items.length,
      2,
    );
    assert.equal(
      (await req("public/storefront/catalog?order=price-asc")).items.length,
      2,
    );
    let usages = (await req("media/" + asset.id)).usages.filter(
      (x) => x.owner_type === "storefront_published",
    );
    assert.deepEqual(
      new Set(usages.map((x) => x.owner_id)),
      new Set([String(p.presentation_id), "promo-" + kit.id]),
    );
    draft = await req(
      "storefront/draft",
      { revision: draft.revision, entries: [product] },
      "PUT",
    );
    await req("storefront/publish", { revision: draft.revision });
    assert.equal(
      (await fetch(base + `/api/public/storefront/media/${asset.id}/mobile`))
        .status,
      200,
    );
    usages = (await req("media/" + asset.id)).usages.filter(
      (x) => x.owner_type === "storefront_published",
    );
    assert.deepEqual(
      usages.map((x) => x.owner_id),
      [String(p.presentation_id)],
    );
    draft = await req(
      "storefront/draft",
      { revision: draft.revision, entries: [] },
      "PUT",
    );
    await req("storefront/publish", { revision: draft.revision });
    assert.equal(
      (await fetch(base + `/api/public/storefront/media/${asset.id}/mobile`))
        .status,
      404,
    );
  } finally {
    await pg.end();
  }
});
