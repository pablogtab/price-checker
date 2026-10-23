import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePromo } from "./price-list-promos";
import { formatPriceList } from "./price-list-format";
import { renderPriceList } from "./price-list-render";
const now = new Date("2026-10-22T12:00:00Z");
const whey = "STAR Premium Whey Protein DOYPACK 2 LB";
const creatine = "STAR Creatina Monohidrato Doypack 300 GR";
function fixture() {
  const catalog = [
    [1, whey, "Banana", 3],
    [2, whey, "Cookies & Cream", 3],
    [3, whey, "Mango", 0],
    [4, whey, "Vainilla", 0],
    [5, creatine, "NEUTRA", 6],
  ].map(([id, group, flavor, stock]) => ({
    id,
    name: `${group} · ${flavor}`,
    variant_group: group,
    own_stock: stock,
    selling_price: "1000",
    kind: "product",
    price_list_order_allowed: true,
  }));
  const offers = catalog.map((p) => ({
    product_id: p.id,
    item_id: p.id,
    available: true,
    stock: 20,
    units: 1,
    provider_id: 1,
    provider_name: "Supplier",
    last_success_at: now,
  }));
  const promo = {
    id: 10,
    name: "PROMO STAR Whey + Creatina",
    kind: "kit",
    selling_price: "90000",
    kit_pricing_mode: "final",
    price_list_order_allowed: true,
  };
  const rows = [
    { kit_id: 10, variant_group: whey, quantity: 1 },
    { kit_id: 10, variant_group: creatine, quantity: 1 },
  ];
  return { catalog, offers, promo, rows };
}
test("mixed promo lists short components once and only additional order flavors", () => {
  const { catalog, offers, promo, rows } = fixture();
  const result = evaluatePromo(promo, rows, catalog, offers, now);
  assert.equal(
    result.promo_details,
    "Proteína: Banana, Cookies & Cream\nCreatina: NEUTRA\nTambién con Mango, Vainilla por encargo.",
  );
  const text = renderPriceList("Lista", [{ ...promo, ...result }], now).text;
  assert.equal(
    text,
    "*Lista*\n22/10/2026\n\n*PROMO STAR Whey + Creatina — $ 90.000,00*\n" +
      result.promo_details,
  );
});
test("single-component promo uses one flavor line and preserves per-flavor limits", () => {
  const { catalog, offers, promo, rows } = fixture();
  rows.splice(1);
  rows[0].quantity = 2;
  assert.equal(
    evaluatePromo(promo, rows, catalog, offers, now).promo_details,
    "Sabores: Banana, Cookies & Cream\nTambién con Mango, Vainilla por encargo.",
  );
  catalog[0].own_stock = 1;
  const details = evaluatePromo(
    promo,
    rows,
    catalog,
    offers,
    now,
  ).promo_details;
  assert.match(details!, /Banana \(máximo 1 en toda la promo\)/);
  assert.match(details!, /Más unidades de Banana por encargo\./);
});
test("order-only promo remains explicitly marked and all eligible flavors are shown", () => {
  const { catalog, offers, promo, rows } = fixture();
  catalog.forEach((p) => (p.own_stock = 0));
  assert.equal(
    evaluatePromo(promo, rows, catalog, offers, now).promo_details,
    "Por encargo\nProteína: Banana, Cookies & Cream, Mango, Vainilla\nCreatina: NEUTRA",
  );
});
test("different protein presentations retain distinct labels", () => {
  const { catalog, offers, promo, rows } = fixture();
  const other = "STAR Whey Protein DOYPACK 3 KG";
  catalog[4].variant_group = other;
  catalog[4].name = other + " · Chocolate";
  rows[1].variant_group = other;
  const details = evaluatePromo(
    promo,
    rows,
    catalog,
    offers,
    now,
  ).promo_details;
  assert.match(details!, new RegExp(whey + ": Banana"));
  assert.match(details!, /STAR Whey Protein DOYPACK 3 KG: Chocolate/);
});

test("a single available flavor keeps its label when the same group includes orders", () => {
  const items = [
    {
      name: "Pre War · Lemonade",
      variant_group: "Pre War",
      price: "25000",
      availability: "available",
    },
    {
      name: "Pre War · Fruit Punch",
      variant_group: "Pre War",
      price: "25000",
      availability: "order",
    },
  ];
  assert.equal(
    formatPriceList("Lista", items, now),
    "*Lista*\n22/10/2026\n\n*Pre War — $ 25.000,00*\nDisponible: Lemonade\nPor encargo: Fruit Punch",
  );
  assert.equal(
    formatPriceList("Lista", [items[0]], now),
    "*Lista*\n22/10/2026\n\n*Pre War — $ 25.000,00*\nLemonade",
  );
});
