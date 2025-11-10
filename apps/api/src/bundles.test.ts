import { test } from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import {
  assembledProfitRange,
  assembledPrice,
  kitSellingPrice,
  kitDiscount,
} from "./bundles";
test("kit retail prices apply a percentage discount then round to the nearest 100", () => {
  const components = [
    { selling_price: "68000", quantity: 1 },
    { selling_price: "23500", quantity: 1 },
  ];
  assert.deepEqual(kitSellingPrice(components, "10"), {
    kit_base_price: "91500",
    selling_price: "82400",
  });
  assert.equal(
    kitSellingPrice([{ selling_price: "100049.99", quantity: 1 }], "0")
      .selling_price,
    "100000",
  );
  assert.equal(
    kitSellingPrice([{ selling_price: "100050", quantity: 1 }], "0")
      .selling_price,
    "100100",
  );
  assert.equal(kitSellingPrice(components, "100").selling_price, "0");
  for (const value of ["-1", "101", "NaN", "Infinity", "abc", "0.123456789"])
    assert.throws(() => kitDiscount(value));
});
test("own kits add exact component unit costs and quantities, preserving stale flags", () => {
  const p = assembledPrice("46000", [
    {
      quantity: 2,
      costArs: "17817.03142857142857142857142857142857143",
      stale: false,
    },
  ]);
  assert.equal(p.costArs, "35634.06285714285714285714285714285714286");
  assert.equal(p.profit, "10365.93714285714285714285714285714285714");
  assert.equal(p.cost?.basis, "assembled");
  assert.equal(
    assembledPrice("90000", [
      { quantity: 1, costArs: "61444", stale: false },
      { quantity: 1, costArs: "21600", stale: true },
    ]).cost?.stale,
    true,
  );
  assert.equal(
    assembledPrice("0", [{ quantity: 2, costArs: "100.25" }]).margin,
    null,
  );
  assert.equal(
    assembledPrice("90000", [
      { quantity: 1, costArs: "61444" },
      { quantity: 1, costArs: null },
    ]).profit,
    null,
  );
});

test("promo profit ranges use low sale/high cost and high sale/low cost", () => {
  const parts = [{ quantity: 2, costArs: "400", costArsMax: "500" }];
  const range = assembledProfitRange("1800", "2200", parts);
  assert.equal(range.profit, "800");
  assert.equal(range.profit_max, "1400");
  assert.equal(range.margin, new Decimal(800).div(1800).mul(100).toString());
  assert.equal(
    range.margin_max,
    new Decimal(1400).div(2200).mul(100).toString(),
  );
  assert.equal(assembledProfitRange("0", "0", parts).margin_max, null);
  assert.equal(
    assembledProfitRange("1800", "2200", [
      { quantity: 1, costArs: null, costArsMax: null },
    ]).profit,
    null,
  );
  const fixed = assembledProfitRange("46000", "46000", [
    { quantity: 2, costArs: "10000", costArsMax: "10000" },
  ]);
  assert.equal(fixed.profit, fixed.profit_max);
});
