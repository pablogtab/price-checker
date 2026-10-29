import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.MEDIA_API || "http://127.0.0.1:3265/api";
import { readFile } from "node:fs/promises";
const png =
  "data:image/png;base64," +
  (await readFile(new URL("./fixtures/media.png", import.meta.url))).toString(
    "base64",
  );
async function request(path, body) {
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
  return { status: r.status, data: await r.json() };
}
test("private library persists uploads and deduplicates retries without losing valid resources", async () => {
  const first = await request("/media", { name: "Foto prueba.png", data: png });
  assert.equal(first.status, 201);
  assert.ok(first.data.id);
  const retry = await request("/media", { name: "Reintento.png", data: png });
  assert.equal(retry.data.id, first.data.id);
  const list = await request("/media?page=1&limit=1");
  assert.equal(list.status, 200);
  assert.equal(list.data.items.length, 1);
  assert.ok(list.data.total >= 1);
  const original = await fetch(base + `/media/${first.data.id}/file/original`);
  assert.equal(original.status, 200);
  assert.equal(original.headers.get("cache-control"), "private, no-store");
  const mobile = await fetch(base + `/media/${first.data.id}/file/mobile`);
  assert.equal(mobile.headers.get("content-type"), "image/webp");
});
test("invalid files are recoverable and concurrent retries preserve one resource", async () => {
  const invalid = await request("/media", {
    name: "fraude.png",
    data: "data:image/png;base64,PGh0bWw+",
  });
  assert.equal(invalid.status, 400);
  const broken = await request("/media", {
    name: "roto.jpg",
    data: "data:image/jpeg;base64,/9j/",
  });
  assert.equal(broken.status, 400);
  const svg = await request("/media", {
    name: "vector.svg",
    data: "data:image/svg+xml;base64,PHN2Zz4=",
  });
  assert.equal(svg.status, 400);
  const large = await request("/media", {
    name: "grande.png",
    data: "data:image/png;base64," + "A".repeat(7 * 1024 * 1024),
  });
  assert.equal(large.status, 400);
  const [a, b] = await Promise.all([
    request("/media", { name: "A", data: png }),
    request("/media", { name: "B", data: png }),
  ]);
  assert.equal(a.data.id, b.data.id);
  const detail = await request("/media/" + a.data.id);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.width, 300);
  assert.equal(detail.data.height, 200);
  const unknown = await request("/media/99999999");
  assert.equal(unknown.status, 404);
  const sources = await request("/media/sources?page=1");
  assert.equal(sources.status, 200);
  assert.ok(Array.isArray(sources.data));
});
test("supported image formats remain reusable and pagination has distinct stable pages", async () => {
  for (const [ext, type] of [
    ["jpg", "jpeg"],
    ["gif", "gif"],
    ["webp", "webp"],
  ]) {
    const data =
      "data:image/" +
      type +
      ";base64," +
      (
        await readFile(new URL("./fixtures/media." + ext, import.meta.url))
      ).toString("base64");
    const result = await request("/media", { name: "Formato " + ext, data });
    assert.equal(result.status, 201);
    assert.equal(result.data.mime, "image/" + type);
  }
  const first = await request("/media?limit=1&page=1");
  const second = await request("/media?limit=1&page=2");
  assert.equal(first.data.items.length, 1);
  assert.equal(second.data.items.length, 1);
  assert.notEqual(first.data.items[0].id, second.data.items[0].id);
  assert.ok(first.data.total >= 4);
  const search = await request("/media?search=Formato");
  assert.equal(search.data.total, 3);
});
