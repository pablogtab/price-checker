import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
const base = process.env.TEST_API_URL;
if (
  !base ||
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname) ||
  !process.env.TEST_STOREFRONT_DATABASE_URL?.endsWith("_test") ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.TEST_STOREFRONT_DATABASE_URL).hostname,
  )
)
  throw Error("Disposable local services required");
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
test("gallery assignment, cover, flavor override and reusable published references are atomic", async () => {
  const group = "Gallery " + Date.now();
  const a = await req("products", {
    name: "Chocolate",
    variant_group: group,
    selling_price: "1200",
  });
  const b = await req("products", {
    name: "Vainilla",
    variant_group: group,
    selling_price: "1200",
  });
  for (const p of [a, b])
    await req(`products/${p.id}/stock`, { quantity: 3 }, "PUT");
  const assets = [];
  for (const color of ["red", "blue", "green"]) {
    const png = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: color },
    })
      .png()
      .toBuffer();
    assets.push(
      await req("media", {
        name: "Gallery " + color,
        data: "data:image/png;base64," + png.toString("base64"),
      }),
    );
  }
  let state = await req("storefront/draft");
  const entry = {
    presentationId: a.presentation_id,
    title: "Whey · 1 kg",
    description: "Galería de la presentación",
    imageKey: null,
    variantIds: [a.id, b.id],
    gallery: [assets[1].id, assets[0].id],
    coverMediaId: assets[0].id,
    variantImages: [{ variantId: a.id, mediaId: assets[2].id }],
  };
  state = await req(
    "storefront/draft",
    { revision: state.revision, entries: [entry] },
    "PUT",
  );
  assert.deepEqual(state.entries[0].gallery, entry.gallery);
  assert.equal(
    (await fetch(base + `/api/public/storefront/media/${assets[0].id}/mobile`))
      .status,
    404,
  );
  await req("storefront/publish", { revision: state.revision });
  let detail = await req(
    `public/storefront/presentations/${a.presentation_id}`,
  );
  assert.deepEqual(
    detail.gallery.map((x) => x.url),
    entry.gallery.map((id) => `/api/public/storefront/media/${id}/desktop`),
  );
  assert.equal(
    detail.imageUrl,
    `/api/public/storefront/media/${assets[0].id}/desktop`,
  );
  assert.equal(
    detail.variants[0].imageUrl,
    `/api/public/storefront/media/${assets[2].id}/desktop`,
  );
  assert.equal(detail.variants[1].imageUrl, detail.imageUrl);
  for (const asset of assets) {
    const r = await fetch(
      base + `/api/public/storefront/media/${asset.id}/mobile`,
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/webp");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal((await req("media/" + asset.id)).usages.length, 2);
  }
  const changed = {
    ...entry,
    gallery: [assets[1].id],
    coverMediaId: assets[1].id,
    variantImages: [],
  };
  state = await req(
    "storefront/draft",
    { revision: state.revision, entries: [changed] },
    "PUT",
  );
  assert.equal((await req("media/" + assets[0].id)).usages.length, 1);
  assert.equal(
    (await fetch(base + `/api/public/storefront/media/${assets[0].id}/desktop`))
      .status,
    200,
  );
  await req(
    "storefront/draft",
    {
      revision: state.revision,
      entries: [{ ...changed, gallery: [999999], coverMediaId: 999999 }],
    },
    "PUT",
    400,
  );
  assert.equal((await req("storefront/draft")).revision, state.revision);
  await req(`products/${a.id}/stock`, { quantity: 0 }, "PUT");
  await req("storefront/publish", { revision: state.revision }, "POST", 400);
  assert.equal(
    (await req("public/storefront/catalog")).items[0].imageUrl,
    detail.imageUrl,
  );
  await req(`products/${a.id}/stock`, { quantity: 3 }, "PUT");
  await req("storefront/publish", { revision: state.revision });
  assert.equal(
    (await fetch(base + `/api/public/storefront/media/${assets[0].id}/desktop`))
      .status,
    404,
  );
  assert.equal(
    (await fetch(base + `/api/media/${assets[0].id}/file/original`)).status,
    200,
  );
  assert.equal((await req("media/" + assets[0].id)).usages.length, 0);
  await req(
    "storefront/draft",
    {
      revision: state.revision,
      entries: [{ ...changed, coverMediaId: assets[0].id }],
    },
    "PUT",
    400,
  );
});
test("one library resource is reused across presentations without flavors and survives removal from one gallery", async () => {
  const resource = (await req("media?search=Gallery%20blue")).items[0];
  assert.ok(resource);
  const products = [];
  for (const name of ["Creatina", "Shaker"]) {
    const p = await req("products", {
      name: name + " " + Date.now(),
      selling_price: "9500",
    });
    await req(`products/${p.id}/stock`, { quantity: 2 }, "PUT");
    products.push(p);
  }
  const entries = products.map((p) => ({
    presentationId: p.presentation_id,
    title: p.name,
    description: "",
    imageKey: null,
    variantIds: [p.id],
    gallery: [resource.id],
    coverMediaId: resource.id,
    variantImages: [],
  }));
  let draft = await req("storefront/draft");
  draft = await req(
    "storefront/draft",
    { revision: draft.revision, entries },
    "PUT",
  );
  await req("storefront/publish", { revision: draft.revision });
  assert.equal((await req("media/" + resource.id)).usages.length, 4);
  for (const p of products) {
    const detail = await req(
      `public/storefront/presentations/${p.presentation_id}`,
    );
    assert.equal(detail.gallery.length, 1);
    assert.equal(detail.variants.length, 1);
    assert.equal(detail.variants[0].imageUrl, detail.imageUrl);
  }
  draft = await req(
    "storefront/draft",
    {
      revision: draft.revision,
      entries: [{ ...entries[0], gallery: [], coverMediaId: null }, entries[1]],
    },
    "PUT",
  );
  await req("storefront/publish", { revision: draft.revision });
  assert.equal((await req("media/" + resource.id)).usages.length, 2);
  assert.equal(
    (await fetch(base + `/api/public/storefront/media/${resource.id}/desktop`))
      .status,
    200,
  );
});
test("publishing galleries preserves a resource assigned to another slot", async () => {
  const resource = (await req("media?search=Gallery%20blue")).items[0];
  const { Client } = await import("pg");
  const fixture = new Client({
    connectionString: process.env.TEST_STOREFRONT_DATABASE_URL,
  });
  await fixture.connect();
  try {
    await fixture.query(
      "INSERT INTO media_asset_usages(asset_id,owner_type,owner_id,slot,label) VALUES($1,'storefront_published','banner-fixture','banner','Banner conservado') ON CONFLICT DO NOTHING",
      [resource.id],
    );
  } finally {
    await fixture.end();
  }
  try {
    const state = await req("storefront/draft");
    const changed = await req(
      "storefront/draft",
      { revision: state.revision, entries: [] },
      "PUT",
    );
    await req("storefront/publish", { revision: changed.revision });
    const asset = await req("media/" + resource.id);
    assert.ok(
      asset.usages.some(
        (u) => u.slot === "banner" && u.label === "Banner conservado",
      ),
    );
    assert.equal(
      (await fetch(base + `/api/media/${resource.id}/file/desktop`)).status,
      200,
    );
    assert.equal(
      (
        await fetch(
          base + `/api/public/storefront/media/${resource.id}/desktop`,
        )
      ).status,
      404,
    );
  } finally {
    const cleanup = new Client({
      connectionString: process.env.TEST_STOREFRONT_DATABASE_URL,
    });
    await cleanup.connect();
    try {
      await cleanup.query(
        "DELETE FROM media_asset_usages WHERE owner_type='storefront_published' AND owner_id='banner-fixture' AND slot='banner'",
      );
    } finally {
      await cleanup.end();
    }
  }
});
