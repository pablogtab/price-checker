import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.TEST_API_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Local API required");
async function api(path, body, method = "POST", status) {
  const r = await fetch(
    base + "/api/" + path,
    body === undefined
      ? {}
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const v = await r.json();
  assert.equal(
    r.status,
    status ?? (body === undefined ? 200 : method === "POST" ? 201 : 200),
    JSON.stringify(v),
  );
  return v;
}
test("public cart validates current prices and exact variants without stock quantity caps", async () => {
  const p = await api("products", {
    name: "Cart " + Date.now(),
    selling_price: "10.15",
  });
  await api(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
  const s = await api("storefront/draft");
  const d = await api(
    "storefront/draft",
    {
      revision: s.revision,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Proteína",
          description: "",
          imageKey: null,
          variantIds: [p.id],
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const lines = [
    {
      kind: "product",
      presentationId: p.presentation_id,
      variantId: p.id,
      quantity: 1001,
    },
  ];
  let v = await api("public/storefront/cart/validate", { lines });
  assert.equal(v.total, "10160.15");
  assert.equal(v.lines[0].price, "10.15");
  assert.equal(v.lines[0].quantity, 1001);
  assert.ok(!/cost|stock|provider|margin/.test(JSON.stringify(v)));
  await api(
    `products/${p.id}/selling-price`,
    { selling_price: "20.25" },
    "PUT",
  );
  v = await api("public/storefront/cart/validate", { lines });
  assert.equal(v.total, "20270.25");
  await api(`products/${p.id}/stock`, { quantity: 0 }, "PUT");
  assert.deepEqual(
    (await api("public/storefront/cart/validate", { lines })).lines,
    [],
  );
  for (const quantity of [0, -1, 1.5, "2", 1000001])
    await api(
      "public/storefront/cart/validate",
      { lines: [{ ...lines[0], quantity }] },
      "POST",
      400,
    );
});

test("exact promo compositions remain distinct, invalid composition removes the whole line and concurrent prices stay coherent", async () => {
  const { Client } = await import("pg");
  const url = process.env.TEST_STOREFRONT_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith("_test") ||
    new URL(url).hostname !== "127.0.0.1"
  )
    throw Error("disposable DB required");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const group = "Cart flavors " + Date.now(),
      a = await api("products", {
        name: "Chocolate",
        variant_group: group,
        selling_price: "100.10",
      }),
      b = await api("products", {
        name: "Banana",
        variant_group: group,
        selling_price: "100.10",
      });
    for (const p of [a, b])
      await api(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    const {
      rows: [kit],
    } = await pg.query(
      "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,kit_discount_percent,position) VALUES($1,'kit',180,'discount',10,999) RETURNING id",
      ["Cart promo " + Date.now()],
    );
    await pg.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,$3)",
      [kit.id, a.id, group],
    );
    const state = await api("storefront/draft");
    const draft = await api(
      "storefront/draft",
      {
        revision: state.revision,
        entries: [
          {
            presentationId: a.presentation_id,
            title: "Proteína",
            description: "",
            variantIds: [a.id, b.id],
            imageKey: null,
          },
          {
            kind: "promo",
            promoId: kit.id,
            title: "Doble proteína",
            description: "",
            imageKey: null,
            promoComponents: [{ componentId: a.id, variantIds: [a.id, b.id] }],
          },
        ],
      },
      "PUT",
    );
    await api("storefront/publish", { revision: draft.revision });
    const composition = (flavor) => ({
      kind: "promo",
      promoId: kit.id,
      selections: [
        { componentId: a.id, unitIndex: 0, variantId: flavor },
        { componentId: a.id, unitIndex: 1, variantId: flavor },
      ],
      quantity: 100,
    });
    const lines = [
      composition(a.id),
      composition(b.id),
      {
        kind: "product",
        presentationId: a.presentation_id,
        variantId: a.id,
        quantity: 2,
      },
    ];
    let result = await api("public/storefront/cart/validate", { lines });
    assert.equal(result.lines.length, 3);
    assert.equal(result.lines[0].selections[0].variantId, a.id);
    assert.equal(result.lines[1].selections[0].variantId, b.id);
    assert.equal(result.lines[0].price, "200");
    assert.equal(result.total, "40200.2");
    const invalid = composition(a.id);
    invalid.selections[1].unitIndex = 0;
    assert.equal(
      (await api("public/storefront/cart/validate", { lines: [invalid] })).lines
        .length,
      0,
    );
    const before = await api("products");
    const sales = await api("sales");
    await Promise.all([
      api(`products/${a.id}/selling-price`, { selling_price: "200.20" }, "PUT"),
      ...Array.from({ length: 8 }, () =>
        api("public/storefront/cart/validate", { lines }).then((v) => {
          assert.ok(["40200.2", "80400.4"].includes(v.total), v.total);
          assert.equal(v.lines[0].price, v.lines[1].price);
        }),
      ),
    ]);
    result = await api("public/storefront/cart/validate", { lines });
    assert.equal(result.total, "80400.4");
    assert.deepEqual(await api("sales"), sales);
    const after = await api("products");
    for (const id of [a.id, b.id])
      assert.equal(
        after.find((p) => p.id === id).own_stock,
        before.find((p) => p.id === id).own_stock,
      );
    await api(`products/${b.id}/stock`, { quantity: 0 }, "PUT");
    result = await api("public/storefront/cart/validate", { lines });
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].selections[0].variantId, a.id);
    assert.equal(result.lines[1].kind, "product");
  } finally {
    await pg.end();
  }
});
