import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCost, calculate, Offer } from "./pricing";
import { validateSnapshot } from "./catalog";
const kit: Offer = {
  id: 2,
  name: "Kit x7",
  available: true,
  price: "140000",
  currency: "ARS",
  stock: "0",
};
const individual: Offer = {
  id: 1,
  name: "Individual",
  available: true,
  price: "25000",
  currency: "ARS",
  stock: "20",
};
test("kit first, even with zero stock", () => {
  const c = chooseCost({ kit, individual });
  assert.equal(c?.amount, "20000");
  assert.equal(c?.basis, "kit");
  assert.equal(c?.stock, "0");
  assert.deepEqual(calculate("30000", c, null), {
    costArs: "20000",
    profit: "10000",
    margin: "33.33333333333333333333333333333333333333",
  });
});
test("unavailable kit falls back to the individual", () => {
  const c = chooseCost({ kit: { ...kit, available: false }, individual });
  assert.equal(c?.amount, "25000");
  assert.equal(c?.basis, "individual");
});
test("no offers retains previous cost and flags it stale", () => {
  const c = chooseCost({
    kit: { ...kit, available: false },
    last_cost: "20000",
    last_currency: "ARS",
    last_basis: "kit",
    last_item_id: 2,
  });
  assert.equal(c?.stale, true);
  assert.equal(c?.amount, "20000");
  assert.equal(chooseCost({}), null);
});
test("USD conversion needs a manual rate; zero selling price has no margin", () => {
  const c = chooseCost({
    individual: { ...individual, currency: "USD", price: "11.3198" },
  });
  assert.deepEqual(calculate("20000", c, null), {
    costArs: null,
    profit: null,
    margin: null,
  });
  assert.equal(calculate("20000", c, "1200").costArs, "13583.76");
  assert.equal(calculate("0", c, "1200").margin, null);
  assert.equal(calculate("10000", c, "1200").profit, "-3583.76");
});
test("reject snapshots before starting an import", () => {
  assert.throws(() => validateSnapshot({ products: [] }));
  assert.throws(() =>
    validateSnapshot({
      schema_version: 1,
      provider: "Disfit",
      products: [{}],
      product_count: 1,
      pages_scraped: 1,
      catalog_reported_total: 1,
      scraped_at: new Date().toISOString(),
    }),
  );
});
test("box costs use the configured selling units; x7 remains the first choice", () => {
  const box = { ...individual, is_pack: true, price: "23635.79" };
  assert.equal(
    chooseCost({ individual: box, individual_units: 16 })?.amount,
    "1477.236875",
  );
  assert.equal(
    chooseCost({ individual: box, individual_units: 1 })?.amount,
    "23635.79",
  );
  assert.equal(
    chooseCost({ individual: box, individual_units: 16 })?.basis,
    "pack",
  );
  assert.equal(
    chooseCost({ kit, individual: box, individual_units: 16 })?.amount,
    "20000",
  );
  assert.equal(
    chooseCost({
      individual: { ...box, available: false },
      individual_units: 16,
      last_cost: "1477.236875",
      last_currency: "ARS",
      last_basis: "pack",
    })?.stale,
    true,
  );
});

test("preferred supplier packs use configurable quantities rather than a fixed x7", () => {
  assert.equal(
    chooseCost({
      kit: { ...kit, name: "Pack x12", price: "1200" },
      kit_units: 12,
      individual,
    })?.amount,
    "100",
  );
  assert.equal(
    chooseCost({
      kit: { ...kit, name: "Pack x6", price: "1200" },
      kit_units: 6,
      individual,
    })?.amount,
    "200",
  );
  assert.equal(
    chooseCost({
      kit: { ...kit, name: "Pack x12", price: "1200" },
      kit_units: 1,
    })?.amount,
    "1200",
  );
  assert.equal(
    chooseCost({
      kit: { ...kit, name: "Pack x12", price: "1200", available: false },
      kit_units: 12,
      individual,
    })?.amount,
    "25000",
  );
});
