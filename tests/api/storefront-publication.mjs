import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.TEST_API_URL;
const testDatabase = process.env.TEST_STOREFRONT_DATABASE_URL;
if (
  !testDatabase ||
  !new URL(testDatabase).pathname.endsWith("_test") ||
  !["127.0.0.1", "localhost"].includes(new URL(testDatabase).hostname)
)
  throw Error("Disposable local database required before fixtures");
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
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
test("approved out-of-stock flavors survive content publication and reappear without republishing", async () => {
  const group = "Publication " + Date.now();
  const a = await req("products", {
    name: "Chocolate",
    variant_group: group,
    selling_price: "21000",
  });
  const b = await req("products", {
    name: "Vainilla",
    variant_group: group,
    selling_price: "21000",
  });
  const hidden = await req("products", {
    name: "Banana",
    variant_group: group,
    selling_price: "21000",
  });
  await req(`products/${a.id}/stock`, { quantity: 4 }, "PUT");
  await req(`products/${hidden.id}/stock`, { quantity: 4 }, "PUT");
  const { readFile } = await import("node:fs/promises");
  const asset = await req("media", {
    name: "Home publication",
    data:
      "data:image/png;base64," +
      (
        await readFile(new URL("../fixtures/media.png", import.meta.url))
      ).toString("base64"),
  });
  const original = await req("storefront/draft");
  const entry = {
    presentationId: a.presentation_id,
    title: "Whey Protein · 1 kg",
    description: "Texto actualizado",
    imageKey: null,
    variantIds: [a.id, b.id],
  };
  const draft = await req(
    "storefront/draft",
    {
      revision: original.revision,
      entries: [entry],
      home: {
        featuredIds: [a.presentation_id],
        banners: [
          {
            id: "publication-home",
            title: "Proteínas",
            mediaId: asset.id,
            destination: { type: "product", id: a.presentation_id },
          },
        ],
      },
    },
    "PUT",
  );
  await req("storefront/publish", { revision: draft.revision });
  assert.deepEqual(
    (
      await req(`public/storefront/presentations/${a.presentation_id}`)
    ).variants.map((v) => v.id),
    [a.id],
  );
  assert.deepEqual((await req("storefront/preview")).issues, []);
  await req(`products/${a.id}/stock`, { quantity: 0 }, "PUT");
  const changed = await req(
    "storefront/draft",
    { ...draft, entries: [{ ...entry, title: "Proteína de suero · 1 kg" }] },
    "PUT",
  );
  await req("storefront/publish", { revision: changed.revision });
  const withdrawn = await req("public/storefront/catalog");
  assert.equal(withdrawn.items.length, 0);
  assert.equal(withdrawn.home.featured.length, 0);
  assert.equal(withdrawn.home.banners.length, 0);
  await req(`products/${b.id}/stock`, { quantity: 2 }, "PUT");
  const item = await req(
    `public/storefront/presentations/${a.presentation_id}`,
  );
  const restored = await req("public/storefront/catalog");
  assert.equal(restored.home.featured.length, 1);
  assert.equal(restored.home.banners.length, 1);
  assert.equal(item.title, "Proteína de suero · 1 kg");
  assert.deepEqual(
    item.variants.map((v) => v.id),
    [b.id],
  );
  assert.equal(
    (await req("public/storefront/catalog")).revision,
    changed.revision,
  );
  assert.deepEqual((await req("storefront/draft")).entries[0].variantIds, [
    a.id,
    b.id,
  ]);
});
test("promo configuration validates every approved flavor even when all are unavailable, then reappears live", async () => {
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: testDatabase });
  await pg.connect();
  try {
    const group = "Publication promo " + Date.now();
    const a = await req("products", {
      name: "Chocolate",
      variant_group: group,
      selling_price: "21000",
    });
    const b = await req("products", {
      name: "Vainilla",
      variant_group: group,
      selling_price: "21000",
    });
    const {
      rows: [kit],
    } = await pg.query(
      "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,kit_discount_percent,position) VALUES('Dos proteínas','kit',38000,'discount',10,999) RETURNING id",
    );
    await pg.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,$3)",
      [kit.id, a.id, group],
    );
    const entry = {
      kind: "promo",
      promoId: kit.id,
      title: "Dúo Whey Protein · 2 × 1 kg",
      description: "Elegí cada sabor",
      imageKey: null,
      promoComponents: [{ componentId: a.id, variantIds: [a.id, b.id] }],
    };
    const state = await req("storefront/draft");
    const draft = await req(
      "storefront/draft",
      {
        ...state,
        entries: [entry],
        home: { featuredIds: [`promo-${kit.id}`], banners: [] },
      },
      "PUT",
    );
    await req("storefront/publish", { revision: draft.revision });
    assert.deepEqual((await req("storefront/preview")).issues, []);
    assert.equal(
      (await req("public/storefront/catalog")).home.featured.length,
      0,
    );
    await req(`products/${b.id}/stock`, { quantity: 1 }, "PUT");
    let catalog = await req("public/storefront/catalog");
    assert.equal(catalog.revision, draft.revision);
    assert.equal(catalog.home.featured[0].price, "37800");
    assert.deepEqual(
      catalog.items[0].components[0].variants.map((v) => v.id),
      [b.id],
    );
    // An unavailable selected flavor must still have a valid common price.
    await pg.query("UPDATE products SET selling_price=100 WHERE id=$1", [a.id]);
    await req("storefront/publish", { revision: draft.revision }, "POST", 400);
    assert.equal(
      (await req("public/storefront/catalog")).revision,
      draft.revision,
    );
    await req(
      `presentations/${a.presentation_id}/price`,
      { catalog_price: "21000" },
      "PUT",
    );
    await pg.query("UPDATE products SET archived=true WHERE id=$1", [a.id]);
    await req("storefront/publish", { revision: draft.revision }, "POST", 400);
    await pg.query("UPDATE products SET archived=false WHERE id=$1", [a.id]);
    await pg.query(
      "UPDATE products SET kit_pricing_mode='final',selling_price=38000 WHERE id=$1",
      [kit.id],
    );
    await req(`products/${b.id}/stock`, { quantity: 0 }, "PUT");
    await req("storefront/publish", { revision: draft.revision });
    await req(`products/${a.id}/stock`, { quantity: 1 }, "PUT");
    assert.equal(
      (await req(`public/storefront/promos/${kit.id}`)).price,
      "38000",
    );
  } finally {
    await pg.end();
  }
});
