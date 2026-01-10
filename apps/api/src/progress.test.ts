import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgress } from "./worker";
test("page progress estimates remaining time and reserves completion for import", () => {
  const p = parseProgress("Page 115/229: 1380/2741 products", 285000)!;
  assert.equal(p.page, 115);
  assert.equal(p.percent, 49);
  assert.equal(p.remaining_seconds, 285);
  assert.equal(
    parseProgress("Page 229/229: 2687/2741 products", 570000)!.percent,
    98,
  );
  assert.equal(
    parseProgress("Page 1/229: 12/2741 products", 1000)!.remaining_seconds,
    null,
  );
  assert.equal(parseProgress("Page 230/229: 10/2741 products", 1000), null);
  assert.equal(parseProgress("private session information", 1000), null);
});
