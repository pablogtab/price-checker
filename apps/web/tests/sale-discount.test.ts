import { test } from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import { discountItems } from "../src/sale-discount";
const total = (items: any[]) =>
  items
    .reduce(
      (s, i) => s.plus(new Decimal(i.unit_price).mul(i.quantity)),
      new Decimal(0),
    )
    .toString();
test("absolute discounts retain exact cents on multiple units and flavors", () => {
  const rows = discountItems(
    [{ product_id: 1, quantity: 3, unit_price: "100" }],
    "amount",
    "10",
  );
  assert.equal(total(rows), "290");
  assert.equal(
    rows.reduce((s, i) => s + i.quantity, 0),
    3,
  );
  const kits = discountItems(
    [
      { quantity: 1, unit_price: "100", selections: ["a"] },
      { quantity: 1, unit_price: "200", selections: ["b"] },
    ],
    "amount",
    "10",
  );
  assert.equal(total(kits), "290");
  assert.deepEqual(
    kits.map((i) => i.selections),
    [["a"], ["b"]],
  );
  assert.equal(
    total(
      discountItems([{ quantity: 3, unit_price: "140000" }], "percent", "10"),
    ),
    "378000",
  );
  assert.equal(
    total(discountItems([{ quantity: 1, unit_price: "100" }], "amount", "100")),
    "0",
  );
  assert.throws(() =>
    discountItems([{ quantity: 1, unit_price: "100" }], "amount", "101"),
  );
  assert.throws(() =>
    discountItems([{ quantity: 1, unit_price: "100" }], "percent", "101"),
  );
});
