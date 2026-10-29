import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
test("home participates in immutable revisions and resolves live featured prices and destinations", async () => {
  const p = await api("products", {
    name: "Creatina 300 g",
    selling_price: "12500",
  });
  await api(`products/${p.id}/stock`, { quantity: 4 }, "PUT");
  const media = await api("media", {
    name: "Creatina",
    data:
      "data:image/png;base64," +
      (
        await readFile(new URL("../fixtures/media.png", import.meta.url))
      ).toString("base64"),
  });
  let d = await api("storefront/draft");
  const home = {
    featuredIds: [p.presentation_id],
    banners: [
      {
        id: "creatina",
        title: "Creatina monohidrato",
        mediaId: media.id,
        destination: { type: "category", id: "creatina" },
      },
    ],
  };
  d = await api(
    "storefront/draft",
    {
      ...d,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Creatina 300 g",
          description: "Monohidrato",
          variantIds: [p.id],
          imageKey: null,
          categoryIds: ["creatina"],
        },
      ],
      categories: [{ id: "creatina", name: "Creatinas" }],
      home,
    },
    "PUT",
  );
  assert.deepEqual(d.home, home);
  assert.deepEqual(
    (await api("storefront/preview")).home.featured.map((x) => x.price),
    ["12500"],
  );
  await api("storefront/publish", { revision: d.revision });
  const published = await api("public/storefront/catalog");
  assert.equal(published.home.banners[0].href, "/?category=creatina");
  await api(
    `presentations/${p.presentation_id}/price`,
    { catalog_price: "14000" },
    "PUT",
  );
  assert.equal(
    (await api("public/storefront/catalog")).home.featured[0].price,
    "14000",
  );
  const edited = await api(
    "storefront/draft",
    {
      ...d,
      home: {
        ...home,
        banners: [{ ...home.banners[0], title: "Nuevo título" }],
      },
    },
    "PUT",
  );
  assert.equal(
    (await api("public/storefront/catalog")).home.banners[0].title,
    "Creatina monohidrato",
  );
  await api("storefront/publish", { revision: d.revision }, "POST", 409);
  await api(
    "storefront/draft",
    { ...edited, home: { ...home, featuredIds: [9999999] } },
    "PUT",
    400,
  );
  assert.equal((await api("storefront/draft")).revision, edited.revision);
  await api(`products/${p.id}/stock`, { quantity: 0 }, "PUT");
  const withdrawn = await api("public/storefront/catalog");
  assert.equal(withdrawn.home.featured.length, 0);
  assert.equal(withdrawn.home.banners.length, 0);
  await api("storefront/publish", { revision: edited.revision }, "POST", 400);
  assert.equal((await api("public/storefront/catalog")).revision, d.revision);
});
test("invalid home edits retain revision and publication; banner media and gallery usages stay separately authorized", async () => {
  const p = await api("products", {
    name: "Whey 1 kg",
    selling_price: "21000",
  });
  await api(`products/${p.id}/stock`, { quantity: 4 }, "PUT");
  const sharp = (await import("sharp")).default;
  const bytes = await sharp({
    create: { width: 30, height: 20, channels: 3, background: "#6a4921" },
  })
    .png()
    .toBuffer();
  const asset = await api("media", {
    name: "Banner de selección",
    data: "data:image/png;base64," + bytes.toString("base64"),
  });
  let d = await api("storefront/draft");
  const entry = {
    presentationId: p.presentation_id,
    title: "Whey 1 kg",
    description: "Proteína",
    variantIds: [p.id],
    imageKey: null,
    gallery: [asset.id],
    coverMediaId: asset.id,
    variantImages: [],
  };
  const home = {
    featuredIds: [p.presentation_id],
    banners: [
      {
        id: "whey",
        title: "Whey Protein",
        mediaId: asset.id,
        destination: { type: "product", id: p.presentation_id },
      },
    ],
  };
  d = await api(
    "storefront/draft",
    { ...d, entries: [entry], categories: [], brands: [], home },
    "PUT",
  );
  for (const invalid of [
    {
      ...home,
      banners: [
        { ...home.banners[0], destination: { type: "product", id: 999999 } },
      ],
    },
    { ...home, banners: [{ ...home.banners[0], mediaId: 999999 }] },
    {
      ...home,
      banners: [
        {
          ...home.banners[0],
          destination: { type: "external", id: "https://example.com" },
        },
      ],
    },
  ]) {
    await api("storefront/draft", { ...d, home: invalid }, "PUT", 400);
    assert.equal((await api("storefront/draft")).revision, d.revision);
  }
  await api("storefront/publish", { revision: d.revision });
  const pub = await api("public/storefront/catalog");
  assert.equal(pub.home.banners[0].href, "/products/" + p.presentation_id);
  let image = await fetch(base + pub.home.banners[0].imageUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  const orderedHome = {
    ...home,
    banners: [
      { ...home.banners[0], id: "second", title: "Otra selección" },
      home.banners[0],
    ],
  };
  d = await api("storefront/draft", { ...d, home: orderedHome }, "PUT");
  assert.deepEqual(
    (await api("public/storefront/catalog")).home.banners.map((b) => b.id),
    ["whey"],
  );
  await api("storefront/publish", { revision: d.revision });
  assert.deepEqual(
    (await api("public/storefront/catalog")).home.banners.map((b) => b.id),
    ["second", "whey"],
  );
  let usages = (await api("media/" + asset.id)).usages;
  for (const owner of ["storefront_draft", "storefront_published"])
    for (const slot of ["gallery", "banner"])
      assert.ok(usages.some((u) => u.owner_type === owner && u.slot === slot));
  d = await api(
    "storefront/draft",
    { ...d, home: { featuredIds: [], banners: [] } },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  usages = (await api("media/" + asset.id)).usages;
  assert.ok(usages.some((u) => u.slot === "gallery"));
  assert.equal(
    usages.some((u) => u.slot === "banner"),
    false,
  );
  assert.equal((await fetch(base + pub.home.banners[0].imageUrl)).status, 200);
  d = await api(
    "storefront/draft",
    {
      ...d,
      entries: [
        { ...entry, gallery: [], coverMediaId: null, variantImages: [] },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  assert.equal((await fetch(base + pub.home.banners[0].imageUrl)).status, 404);
  assert.equal(
    (await fetch(base + `/api/public/storefront/media/${asset.id}/original`))
      .status,
    404,
  );
});
test("entry-only edits retain valid home metadata and prune references to withdrawn selections", async () => {
  const p = await api("products", { name: "Selección", selling_price: "500" });
  await api(`products/${p.id}/stock`, { quantity: 2 }, "PUT");
  let d = await api("storefront/draft");
  d = await api(
    "storefront/draft",
    {
      ...d,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Selección",
          description: "",
          variantIds: [p.id],
          imageKey: null,
        },
      ],
      categories: [],
      home: { featuredIds: [p.presentation_id], banners: [] },
    },
    "PUT",
  );
  const retained = await api(
    "storefront/draft",
    { revision: d.revision, entries: d.entries },
    "PUT",
  );
  assert.deepEqual(retained.home, d.home);
  const removed = await api(
    "storefront/draft",
    { revision: retained.revision, entries: [] },
    "PUT",
  );
  assert.deepEqual(removed.home, { featuredIds: [], banners: [] });
});
