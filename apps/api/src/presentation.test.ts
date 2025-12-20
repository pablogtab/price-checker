import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPackaging } from "./presentation";

test("Packaging cannot silently substitute jar for doypack", () => {
  assert.throws(() => checkPackaging("Whey DOYPACK", "Whey POTE", true));
  assert.throws(() => checkPackaging("Whey jar", "Whey doypack", true));
  assert.throws(() => checkPackaging("Whey DOYPACK", "Platinum Whey 2 Lbs"));
  assert.doesNotThrow(() => checkPackaging("Whey DOYPACK", "Premium Whey DOYPACK"));
  assert.doesNotThrow(() => checkPackaging("Whey DOYPACK", "Whey", true));
});
