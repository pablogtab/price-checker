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
