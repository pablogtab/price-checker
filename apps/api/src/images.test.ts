import { test } from "node:test";
import assert from "node:assert/strict";
import { imageKey, imageMime } from "./images";
test("image cache keys reject unsafe URLs and recognize only image formats", () => {
  const url = "https://app.coverweb.com.ar/imagenes_url/171447.jpg";
  assert.match(imageKey(url), /^[a-f0-9]{64}$/);
  assert.equal(imageKey(url), imageKey(url));
  for (const bad of [
    "http://app.coverweb.com.ar/imagenes_url/a.jpg",
    "https://other.test/a.jpg",
    url + "?t=secret",
    "https://app.coverweb.com.ar/imagenes_url/../a.jpg",
  ])
    assert.throws(() => imageKey(bad));
  assert.equal(imageMime(Buffer.from([255, 216, 255])), "image/jpeg");
  assert.equal(imageMime(Buffer.from("GIF89a")), "image/gif");
  assert.throws(() => imageMime(Buffer.from("<html>login</html>")));
});

test("product uploads are cached once by content and reject invalid and oversized files", async () => {
  const { saveProductImage, cachedImage } = await import("./images");
  const { mkdtemp, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const folder = await mkdtemp(join(tmpdir(), "product-image-test-"));
  try {
    const value =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=";
    const key = await saveProductImage(value, folder);
    assert(key);
    const before = await stat(join(folder, key));
    assert.equal(await saveProductImage(value, folder), key);
    assert.equal((await stat(join(folder, key))).mtimeMs, before.mtimeMs);
    assert.equal((await cachedImage(key, folder)).type, "image/png");
    assert.equal(await saveProductImage(null, folder), null);
    assert.equal(await saveProductImage(undefined, folder), undefined);
    await assert.rejects(
      saveProductImage("data:image/png;base64,PGh0bWw+", folder),
    );
    await assert.rejects(
      saveProductImage("data:image/svg+xml;base64,PHN2Zz4=", folder),
    );
    await assert.rejects(
      saveProductImage("a".repeat(7 * 1024 * 1024 + 1), folder),
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
