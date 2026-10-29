import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("Disposable _test database required");
const client = new pg.Client({ connectionString: url });
await client.connect();
const base = process.env.MEDIA_API || "http://127.0.0.1:3265/api";
async function api(path, body) {
  const r = await fetch(
    base + path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  assert.equal(r.status, body ? 201 : 200);
  return r.json();
}
test("explicitly importing existing product images preserves original assignment and other usages", async () => {
  try {
    const png =
      "data:image/png;base64," +
      (
        await readFile(new URL("./fixtures/media.png", import.meta.url))
      ).toString("base64");
    const product = await api("/products", {
      name: "Producto imagen existente " + Date.now(),
      selling_price: "100",
      image_data: png,
    });
    const before = (
      await client.query("SELECT custom_image_path FROM products WHERE id=$1", [
        product.id,
      ])
    ).rows[0];
    assert.ok(before.custom_image_path);
    const sources = await api("/media/sources");
    assert.ok(
      sources.some((s) => s.id === product.id && s.source === "product"),
    );
    const asset = await api("/media/import", {
      source: "product",
      id: product.id,
    });
    assert.ok(asset.id);
    assert.deepEqual(
      (
        await client.query(
          "SELECT custom_image_path FROM products WHERE id=$1",
          [product.id],
        )
      ).rows[0],
      before,
    );
    await client.query(
      "INSERT INTO media_asset_usages(asset_id,owner_type,owner_id,slot,label) VALUES($1,'fixture','one','gallery','Presentación de prueba'),($1,'fixture','two','banner','Banner de prueba') ON CONFLICT DO NOTHING",
      [asset.id],
    );
    assert.equal((await api("/media/" + asset.id)).usages.length, 2);
    await client.query(
      "DELETE FROM media_asset_usages WHERE owner_type='fixture' AND owner_id='one' AND asset_id=$1",
      [asset.id],
    );
    assert.equal((await api("/media/" + asset.id)).usages.length, 1);
    assert.equal(
      (await fetch(base + "/media/" + asset.id + "/file/original")).status,
      200,
    );
    await client.query(
      "DELETE FROM media_asset_usages WHERE owner_type='fixture' AND asset_id=$1",
      [asset.id],
    );
  } finally {
    await client.end();
  }
});
