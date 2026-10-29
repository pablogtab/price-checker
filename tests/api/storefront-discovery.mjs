import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.TEST_API_URL;
if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Local API required");
async function api(path, body, method = "POST", status) {
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
test("commercial categories and brands publish atomically with multiple assignments", async () => {
  const d = await api("storefront/draft");
  const saved = await api(
    "storefront/draft",
    {
      revision: d.revision,
      entries: [],
      categories: [
        { id: "nutrition", name: "Nutrición" },
        { id: "empty", name: "Vacía" },
      ],
      brands: [{ id: "geva", name: "GEVA" }],
    },
    "PUT",
  );
  assert.deepEqual(saved.categories, [
    { id: "nutrition", name: "Nutrición" },
    { id: "empty", name: "Vacía" },
  ]);
  await api("storefront/publish", { revision: saved.revision });
  assert.deepEqual(
    (await api("public/storefront/categories")).items,
    saved.categories,
  );
});
test("combined public search, facets, stable price/manual pages and publication revision guard", async () => {
  const items = [];
  for (const [name, price] of [
    ["Chocolate", "2000"],
    ["Frutilla", "1000"],
    ["Vainilla", "1000"],
  ]) {
    const p = await api("products", { name, selling_price: price });
    await api(`products/${p.id}/stock`, { quantity: 4 }, "PUT");
    items.push({
      presentationId: p.presentation_id,
      title: "Proteína " + name,
      description: "Nutrición deportiva",
      imageKey: null,
      variantIds: [p.id],
      categoryIds: ["nutrition", "sport"],
      brandId: "geva",
    });
  }
  const hidden = await api("products", {
    name: "Sabor secreto",
    variant_group: "private " + Date.now(),
    selling_price: "800",
  });
  await api(`products/${hidden.id}/stock`, { quantity: 3 }, "PUT");
  const d = await api("storefront/draft");
  const saved = await api(
    "storefront/draft",
    {
      revision: d.revision,
      entries: items,
      categories: [
        { id: "sport", name: "Deporte" },
        { id: "nutrition", name: "Nutrición" },
        { id: "empty", name: "Vacía" },
      ],
      brands: [
        { id: "geva", name: "GEVA" },
        { id: "other", name: "Otra" },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: saved.revision });
  const page = await api(
    "public/storefront/catalog?q=proteina&category=nutrition&brand=geva&order=price-asc&pageSize=1",
  );
  assert.equal(page.total, 3);
  assert.equal(page.items[0].title, "Proteína Frutilla");
  assert.equal(page.revision, saved.revision);
  assert.deepEqual(page.items[0].categoryIds, ["nutrition", "sport"]);
  assert.deepEqual(page.items[0].brand, { id: "geva", name: "GEVA" });
  assert.equal(
    (
      await api(
        `public/storefront/catalog?order=price-asc&pageSize=1&page=2&revision=${page.revision}`,
      )
    ).items[0].title,
    "Proteína Vainilla",
  );
  assert.equal(
    (await api("public/storefront/catalog?order=manual")).items[0].title,
    "Proteína Chocolate",
  );
  assert.equal(
    (
      await api(
        "public/storefront/catalog?q=frutilla&category=sport&brand=geva",
      )
    ).total,
    1,
  );
  for (const query of [
    "category=empty",
    "q=secreto",
    "brand=other",
    "category=nutrition&brand=other",
  ])
    assert.equal((await api("public/storefront/catalog?" + query)).total, 0);
  const edited = await api(
    "storefront/draft",
    {
      ...saved,
      entries: [...items].reverse(),
      categories: [
        { id: "sport", name: "Entrenamiento" },
        { id: "nutrition", name: "Nutrición" },
      ],
    },
    "PUT",
  );
  assert.equal(
    (await api("public/storefront/categories")).items[0].name,
    "Deporte",
  );
  await api("storefront/publish", { revision: edited.revision });
  await api(
    `public/storefront/catalog?page=2&revision=${page.revision}`,
    undefined,
    "GET",
    409,
  );
  assert.equal(
    (await api("public/storefront/catalog")).items[0].title,
    "Proteína Vainilla",
  );
  await api(
    "storefront/draft",
    { ...edited, entries: [{ ...items[0], categoryIds: ["missing"] }] },
    "PUT",
    400,
  );
});
test("category product ordering is independent of the store order", async () => {
  const d = await api("storefront/draft");
  const ids = d.entries.map((e) => e.presentationId);
  const category = { ...d.categories[0], productIds: [ids[2], ids[0], ids[1]] };
  const changed = await api(
    "storefront/draft",
    { ...d, categories: [category, ...d.categories.slice(1)] },
    "PUT",
  );
  await api("storefront/publish", { revision: changed.revision });
  assert.deepEqual(
    (await api("public/storefront/catalog?category=" + category.id)).items.map(
      (x) => x.id,
    ),
    [ids[2], ids[0], ids[1]],
  );
  assert.deepEqual(
    (await api("public/storefront/catalog")).items.map((x) => x.id),
    ids,
  );
});
test("older entry-only editors retain revision organization when saving", async () => {
  const d = await api("storefront/draft");
  const saved = await api(
    "storefront/draft",
    { revision: d.revision, entries: d.entries },
    "PUT",
  );
  assert.deepEqual(saved.categories, d.categories);
  assert.deepEqual(saved.brands, d.brands);
});
