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
test("owner saves a draft and publishes only selected flavors with live common price", async () => {
  const group = "Store " + Date.now();
  const a = await req("products", {
    name: "Chocolate",
    variant_group: group,
    selling_price: "1234.56",
  });
  const b = await req("products", {
    name: "Banana",
    variant_group: group,
    selling_price: "1",
  });
  await req(`products/${a.id}/stock`, { quantity: 3 }, "PUT");
  await req(`products/${b.id}/stock`, { quantity: 2 }, "PUT");
  const original = await req("storefront/draft");
  const entry = {
    presentationId: a.presentation_id,
    title: "Proteína 1 kg",
    description: "Contenido comercial propio",
    imageKey: null,
    variantIds: [a.id],
  };
  const draft = await req(
    "storefront/draft",
    { revision: original.revision, entries: [entry] },
    "PUT",
  );
  assert.equal((await req("storefront/preview")).items[0].title, entry.title);
  assert.equal(
    (await req("public/storefront/catalog")).items.some(
      (x) => x.id === a.presentation_id,
    ),
    false,
  );
  await req("storefront/publish", { revision: draft.revision });
  const item = await req(
    `public/storefront/presentations/${a.presentation_id}`,
  );
  assert.deepEqual(
    Object.keys(item).sort(),
    [
      "categoryIds",
      "brand",
      "currency",
      "description",
      "id",
      "imageUrl",
      "price",
      "title",
      "variants",
    ].sort(),
  );
  assert.deepEqual(item.variants, [{ id: a.id, label: "Chocolate" }]);
  assert.equal(item.price, "1234.56");
  const later = await req("products", {
    name: "Nuevo sabor",
    variant_group: group,
    selling_price: "1",
  });
  await req(`products/${later.id}/stock`, { quantity: 10 }, "PUT");
  assert.deepEqual(
    (await req(`public/storefront/presentations/${a.presentation_id}`))
      .variants,
    [{ id: a.id, label: "Chocolate" }],
  );
  await req(
    `presentations/${a.presentation_id}/price`,
    { catalog_price: "2100.25" },
    "PUT",
  );
  assert.equal(
    (await req(`public/storefront/presentations/${a.presentation_id}`)).price,
    "2100.25",
  );
  const changed = await req(
    "storefront/draft",
    {
      revision: draft.revision,
      entries: [{ ...entry, title: "Nuevo borrador", variantIds: [b.id] }],
    },
    "PUT",
  );
  assert.equal(
    (await req(`public/storefront/presentations/${a.presentation_id}`)).title,
    entry.title,
  );
  await req(`products/${b.id}/stock`, { quantity: 0 }, "PUT");
  await req("storefront/publish", { revision: changed.revision }, "POST", 400);
  assert.equal(
    (await req(`public/storefront/presentations/${a.presentation_id}`)).title,
    entry.title,
  );
  await req(
    "storefront/draft",
    { revision: draft.revision, entries: [] },
    "PUT",
    409,
  );
  await req(`products/${a.id}/stock`, { quantity: 0 }, "PUT");
  assert.equal((await req("public/storefront/catalog")).items.length, 0);
});
test("draft-only images remain private until publication and revoked images stop being public", async () => {
  const data =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zL8AAAAASUVORK5CYII=";
  const p = await req("products", {
    name: "Image " + Date.now(),
    selling_price: "3500",
    image_data: data,
  });
  await req(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
  const product = (await req("products")).find((x) => x.id === p.id),
    key = product.image_path;
  assert.match(key, /^[a-f0-9]{64}$/);
  const state = await req("storefront/draft");
  const entry = {
    presentationId: p.presentation_id,
    title: "Imagen privada",
    description: "Solo borrador",
    imageKey: key,
    variantIds: [p.id],
  };
  const draft = await req(
    "storefront/draft",
    { revision: state.revision, entries: [entry] },
    "PUT",
  );
  await req("public/storefront/images/" + key, undefined, "GET", 404);
  await req("storefront/publish", { revision: draft.revision });
  const image = await fetch(base + "/api/public/storefront/images/" + key);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("cache-control"), "no-store");
  const unpublished = await req(
    "storefront/draft",
    { revision: draft.revision, entries: [] },
    "PUT",
  );
  await req("storefront/publish", { revision: unpublished.revision });
  await req("public/storefront/images/" + key, undefined, "GET", 404);
});
test("private preview retains the complete draft and explains unavailable selections", async () => {
  const p = await req("products", {
    name: "Sin stock " + Date.now(),
    selling_price: "1200",
  });
  const original = await req("storefront/draft");
  await req(
    "storefront/draft",
    {
      revision: original.revision,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Contenido pendiente",
          description: "Texto en preparación",
          imageKey: null,
          variantIds: [p.id],
        },
      ],
    },
    "PUT",
  );
  const preview = await req("storefront/preview");
  assert.equal(preview.entries.length, 1);
  assert.equal(preview.entries[0].title, "Contenido pendiente");
  assert.equal(preview.issues.length, 1);
  assert.match(preview.issues[0].message, /stock/);
  assert.equal(
    (await req("public/storefront/catalog")).items.some(
      (i) => i.id === p.presentation_id,
    ),
    false,
  );
});
test("unresolved or zero common prices cannot publish and never appear publicly", async () => {
  const p = await req("products", {
    name: "Precio pendiente " + Date.now(),
    selling_price: "500",
  });
  await req(`products/${p.id}/stock`, { quantity: 2 }, "PUT");
  const state = await req("storefront/draft");
  const entry = {
    presentationId: p.presentation_id,
    title: "Precio a revisar",
    description: "",
    imageKey: null,
    variantIds: [p.id],
  };
  const draft = await req(
    "storefront/draft",
    { revision: state.revision, entries: [entry] },
    "PUT",
  );
  await req("storefront/publish", { revision: draft.revision });
  const { Client } = await import("pg");
  const url = process.env.TEST_STOREFRONT_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith("_test") ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  )
    throw Error("Disposable local database required");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    await pg.query("UPDATE presentations SET catalog_price=NULL WHERE id=$1", [
      p.presentation_id,
    ]);
  } finally {
    await pg.end();
  }
  await req(
    `public/storefront/presentations/${p.presentation_id}`,
    undefined,
    "GET",
    404,
  );
  await req("storefront/publish", { revision: draft.revision }, "POST", 400);
  await req(
    `presentations/${p.presentation_id}/price`,
    { catalog_price: "0" },
    "PUT",
  );
  await req("storefront/publish", { revision: draft.revision }, "POST", 400);
  await req(
    `presentations/${p.presentation_id}/price`,
    { catalog_price: "975.50" },
    "PUT",
  );
  assert.equal(
    (await req(`public/storefront/presentations/${p.presentation_id}`)).price,
    "975.5",
  );
  const foreign = await req("products", {
    name: "Otra presentación " + Date.now(),
    selling_price: "100",
  });
  await req(`products/${foreign.id}/stock`, { quantity: 2 }, "PUT");
  const changed = await req(
    "storefront/draft",
    {
      revision: draft.revision,
      entries: [{ ...entry, variantIds: [foreign.id] }],
    },
    "PUT",
  );
  await req("storefront/publish", { revision: changed.revision }, "POST", 400);
  assert.equal(
    (await req(`public/storefront/presentations/${p.presentation_id}`)).price,
    "975.5",
  );
});
