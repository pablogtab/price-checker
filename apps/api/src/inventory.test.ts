import { test } from "node:test";
import assert from "node:assert/strict";
import { kitStock, stockQuantity } from "./inventory";
test("own inventory distinguishes unknown stock, zero stock and component-limited kits", () => {
  assert.equal(
    kitStock([
      { own_stock: 10, quantity: 2 },
      { own_stock: 3, quantity: 1 },
    ]),
    3,
  );
  assert.equal(kitStock([{ own_stock: 1, quantity: 2 }]), 0);
  assert.equal(kitStock([{ own_stock: null, quantity: 2 }]), null);
  assert.equal(kitStock([]), null);
  assert.equal(stockQuantity("0"), 0);
  assert.equal(stockQuantity(1000000000), 1000000000);
  for (const n of [null, true, "", "1e3", -1, 1.2, 1000000001])
    assert.throws(() => stockQuantity(n));
});
