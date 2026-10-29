import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePrices } from "./price-analysis";
const old = (
  id: string,
  price: string,
  currency = "ARS",
  stock = "0",
  available = true,
) => ({ external_id: id, name: id, price, currency, stock, available });
const item = (id: string, amount: string, currency = "ARS", stock = "0") => ({
  id,
  name: id,
  internal_code: "00" + id,
  barcode: "000" + id,
  stock,
  price: { amount, currency },
});
test("price analysis preserves decimal differences, counts stock separately and detects currency changes", () => {
  const result = analyzePrices(
    [
      old("up", "0.1"),
      old("down", "100", "USD"),
      old("fx", "10", "USD"),
      old("same", "2"),
      old("gone", "9"),
      old("back", "2", "ARS", "0", false),
    ],
    {
      products: [
        item("up", "0.3"),
        item("down", "90", "USD"),
        item("fx", "15000"),
        item("same", "2", "ARS", "7"),
        item("new", "1"),
        item("back", "3"),
      ],
    },
  );
  assert.deepEqual(result.summary, {
    baseline: false,
    compared: 4,
    increased: 1,
    decreased: 1,
    currency_changed: 1,
    unchanged_prices: 1,
    stock_changed: 1,
    added: 2,
    unavailable: 1,
  });
  assert.equal(result.changes[0].delta, "0.2");
  assert.equal(result.changes[0].percent, "200");
  assert.equal(
    result.changes.find((c) => c.external_id === "down").percent,
    "-10",
  );
  assert.equal(result.changes.find((c) => c.external_id === "fx").delta, null);
  assert.equal(
    result.changes.find((c) => c.external_id === "fx").percent,
    null,
  );
  assert.equal(result.changes[0].barcode, "000up");
});
test("first catalog is a baseline and zero old prices have no percentage", () => {
  const baseline = analyzePrices([], { products: [item("a", "10")] });
  assert.equal(baseline.summary.baseline, true);
  assert.deepEqual(baseline.changes, []);
  const result = analyzePrices([old("a", "0")], {
    products: [item("a", "10")],
  });
  assert.equal(result.changes[0].delta, "10");
  assert.equal(result.changes[0].percent, null);
});
test("a successful catalog replaces unknown supplier stock without losing its null historical value", () => {
  const previous = [
    { ...old("positive", "100"), stock: null },
    { ...old("zero", "100"), stock: null },
  ];
  const result = analyzePrices(previous, {
    products: [
      item("positive", "110", "ARS", "3"),
      item("zero", "90", "ARS", "0"),
    ],
  });
  assert.equal(result.summary.stock_changed, 2);
  assert.equal(result.summary.increased, 1);
  assert.equal(result.summary.decreased, 1);
  assert.deepEqual(
    result.changes
      .map((c) => ({
        id: c.external_id,
        before: c.old_stock,
        after: c.new_stock,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    [
      { id: "positive", before: null, after: "3" },
      { id: "zero", before: null, after: "0" },
    ],
  );
});
