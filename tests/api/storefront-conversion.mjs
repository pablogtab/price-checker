import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL;
if (!base || new URL(base).hostname !== "127.0.0.1")
  throw Error("local API required");
async function api(path, body, method = "POST", expected) {
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
    expected ?? (body === undefined ? 200 : method === "POST" ? 201 : 200),
    JSON.stringify(v),
  );
  return v;
}
test("private anonymous inbox searches original requests and discards only pending without sales", async () => {
  await api("storefront/whatsapp", { number: "12025550123" }, "PUT");
  const p = await api("products", {
    name: "Whey Chocolate " + Date.now(),
    selling_price: "1250.25",
  });
  await api(`products/${p.id}/stock`, { quantity: 10 }, "PUT");
  const s = await api("storefront/draft");
  const d = await api(
    "storefront/draft",
    {
      revision: s.revision,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Whey Protein 1 kg",
          description: "",
          variantIds: [p.id],
          imageKey: null,
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const receipt = await api("public/storefront/orders", {
    requestKey: randomUUID(),
    lines: [
      {
        kind: "product",
        presentationId: p.presentation_id,
        variantId: p.id,
        quantity: 3,
      },
    ],
  });
  const before = await api("sales");
  const list = await api(
    "storefront/orders?status=pending&q=" + receipt.number,
  );
  assert.equal(list.total, 1);
  assert.equal(list.rows[0].snapshot.number, receipt.number);
  const detail = await api("storefront/orders/" + list.rows[0].id);
  assert.deepEqual(detail.snapshot.lines, receipt.lines);
  assert.equal(detail.sale_id, null);
  await api(`storefront/orders/${detail.id}/discard`, {});
  assert.equal(
    (await api("storefront/orders/" + detail.id)).status,
    "discarded",
  );
  await api(`storefront/orders/${detail.id}/discard`, {}, "POST", 409);
  assert.deepEqual(await api("sales"), before);
});
async function orderFixture(price = "1250.25") {
  await api("storefront/whatsapp", { number: "12025550123" }, "PUT");
  const p = await api("products", {
    name: "Whey Vainilla " + randomUUID().slice(0, 8),
    selling_price: price,
  });
  await api(`products/${p.id}/stock`, { quantity: 10 }, "PUT");
  const s = await api("storefront/draft");
  const d = await api(
    "storefront/draft",
    {
      revision: s.revision,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Whey Protein 1 kg",
          description: "",
          variantIds: [p.id],
          imageKey: null,
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const receipt = await api("public/storefront/orders", {
    requestKey: randomUUID(),
    lines: [
      {
        kind: "product",
        presentationId: p.presentation_id,
        variantId: p.id,
        quantity: 3,
      },
    ],
  });
  const o = (await api("storefront/orders?q=" + receipt.number)).rows[0];
  return { p, o, receipt };
}
test("source order converts atomically exactly once under competing keys and original retry", async () => {
  const { p, o, receipt } = await orderFixture();
  const customer = await api("customers", { name: "Cliente conversión" });
  const body = {
    source_order_id: o.id,
    request_key: randomUUID(),
    sold_on: "2026-10-29",
    customer_id: customer.id,
    items: [
      { product_id: p.id, quantity: 3, unit_price: "1250.25", selections: [] },
    ],
  };
  const result = await api("sales", body);
  const detail = await api("storefront/orders/" + o.id);
  assert.equal(detail.status, "converted");
  assert.equal(detail.sale_id, result.id);
  assert.deepEqual(detail.snapshot.lines, receipt.lines);
  assert.deepEqual(await api("sales", body), result);
  await api("sales", { ...body, request_key: randomUUID() }, "POST", 409);
  await api(`storefront/orders/${o.id}/discard`, {}, "POST", 409);
  const product = (await api("products")).find((x) => x.id === p.id);
  assert.equal(product.own_stock, 7);
  const client = (await api("customers")).find((x) => x.id === customer.id);
  assert.equal(client.balance, "3750.75");
});
async function pgConnect() {
  const url = process.env.TEST_CONVERSION_DATABASE_URL;
  if (
    !url ||
    new URL(url).hostname !== "127.0.0.1" ||
    !new URL(url).pathname.endsWith("_test")
  )
    throw Error("disposable conversion DB required");
  const { Client } = await import("pg");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  return pg;
}
async function counts(pg) {
  const out = {};
  for (const t of [
    "sales",
    "sale_items",
    "sale_components",
    "sale_payments",
    "cash_operations",
    "cash_entries",
    "stock_movements",
  ])
    out[t] = (await pg.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
  return out;
}
test("invalid account after stock writes rolls back; concurrent full collection has one sale and one cash receipt; annul preserves source", async () => {
  const pg = await pgConnect();
  try {
    const { p, o } = await orderFixture();
    const body = {
      source_order_id: o.id,
      request_key: randomUUID(),
      sold_on: "2026-10-29",
      items: [{ product_id: p.id, quantity: 3, unit_price: "1250.25" }],
      payment: { account_id: 2147483647, amount: "3750.75" },
    };
    const before = await counts(pg);
    await api("sales", body, "POST", 404);
    assert.deepEqual(await counts(pg), before);
    assert.equal((await api("storefront/orders/" + o.id)).status, "pending");
    assert.equal(
      (await pg.query("SELECT own_stock FROM products WHERE id=$1", [p.id]))
        .rows[0].own_stock,
      10,
    );
    const a = await api("cash/accounts", {
      name: "Conversión " + randomUUID(),
      currency: "ARS",
      opening_balance: "0",
    });
    body.payment.account_id = a.id;
    const attempts = await Promise.all(
      [body, { ...body, request_key: randomUUID() }].map(async (b) => {
        const r = await fetch(base + "/api/sales", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(b),
        });
        return { status: r.status, body: await r.json(), request: b };
      }),
    );
    assert.deepEqual(attempts.map((x) => x.status).sort(), [201, 409]);
    const winner = attempts.find((x) => x.status === 201);
    const loser = attempts.find((x) => x.status === 409);
    assert.equal(loser.body.code, "ORDER_ALREADY_CONVERTED");
    assert.equal(loser.body.sale_id, winner.body.id);
    const after = await counts(pg);
    for (const t of Object.keys(before))
      assert.equal(after[t] - before[t], 1, t);
    assert.equal(
      (await api("cash/accounts")).find((x) => x.id === a.id).balance,
      "3750.75",
    );
    assert.equal(
      (await api("products")).find((x) => x.id === p.id).own_stock,
      7,
    );
    const preview = await api(`sales/${winner.body.id}/annul/preview`, {});
    await api(`sales/${winner.body.id}/annul`, {
      preview_token: preview.preview_token,
      request_key: randomUUID(),
    });
    assert.equal((await api("storefront/orders/" + o.id)).status, "converted");
    assert.equal(
      (await api("storefront/orders/" + o.id)).sale_id,
      winner.body.id,
    );
    assert.deepEqual(await api("sales", winner.request), winner.body);
    await api(
      "sales",
      { ...winner.request, request_key: randomUUID() },
      "POST",
      409,
    );
    assert.equal(
      (await api("cash/accounts")).find((x) => x.id === a.id).balance,
      "0",
    );
    assert.equal(
      (await api("products")).find((x) => x.id === p.id).own_stock,
      10,
    );
  } finally {
    await pg.end();
  }
});
test("partial collection uses existing debt engine; trigger failure rolls back link, stock, cash and debt", async () => {
  const pg = await pgConnect();
  try {
    const { p, o } = await orderFixture();
    const customer = await api("customers", { name: "Cliente parcial" });
    const a = await api("cash/accounts", {
      name: "Parcial " + randomUUID(),
      currency: "ARS",
      opening_balance: "0",
    });
    const body = {
      source_order_id: o.id,
      request_key: randomUUID(),
      sold_on: "2026-10-29",
      customer_id: customer.id,
      items: [{ product_id: p.id, quantity: 3, unit_price: "1250.25" }],
      payment: { account_id: a.id, amount: "1000" },
    };
    const before = await counts(pg);
    await pg.query(
      "CREATE FUNCTION conversion_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable conversion failure'; END $$; CREATE TRIGGER conversion_test_failure BEFORE UPDATE ON storefront_orders FOR EACH ROW EXECUTE FUNCTION conversion_test_failure()",
    );
    try {
      await api("sales", body, "POST", 500);
    } finally {
      await pg.query(
        "DROP TRIGGER conversion_test_failure ON storefront_orders; DROP FUNCTION conversion_test_failure()",
      );
    }
    assert.deepEqual(await counts(pg), before);
    assert.equal(
      (await api("customers")).find((x) => x.id === customer.id).balance,
      "0",
    );
    assert.equal((await api("storefront/orders/" + o.id)).status, "pending");
    assert.equal(
      (await api("products")).find((x) => x.id === p.id).own_stock,
      10,
    );
    const sale = await api("sales", body);
    await api("sales", body);
    assert.equal(
      (await api("customers")).find((x) => x.id === customer.id).balance,
      "2750.75",
    );
    assert.equal(
      (await api("cash/accounts")).find((x) => x.id === a.id).balance,
      "1000",
    );
    const after = await counts(pg);
    for (const t of Object.keys(before))
      assert.equal(after[t] - before[t], 1, t);
    // Editing commercial terms must not reopen or detach the source.
    const recorded = (await api("sales")).find((s) => s.id === sale.id);
    const edited = {
      payments: recorded.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        account_id: p.account_id,
        occurred_on: p.occurred_on,
      })),
      customer_id: customer.id,
      sold_on: "2026-10-29",
      note: "Precio acordado",
      items: [{ product_id: p.id, quantity: 2, unit_price: "1200" }],
      discount: { mode: "amount", value: "0" },
    };
    const preview = await api(`sales/${sale.id}/joint-edit/preview`, edited);
    await api(`sales/${sale.id}/joint-edits`, {
      ...edited,
      preview_token: preview.preview_token,
      request_key: randomUUID(),
    });
    assert.equal((await api("storefront/orders/" + o.id)).sale_id, sale.id);
    assert.equal((await api("storefront/orders/" + o.id)).status, "converted");
    assert.equal((await api("sales", body)).id, sale.id);
  } finally {
    await pg.end();
  }
});
test("archived source fails safely and historical three-decimal order requires explicit correction", async () => {
  const pg = await pgConnect();
  try {
    const { p, o, receipt } = await orderFixture("1250.255");
    const customer = await api("customers", { name: "Corrección precio" });
    const body = {
      source_order_id: o.id,
      request_key: randomUUID(),
      sold_on: "2026-10-29",
      customer_id: customer.id,
      items: [{ product_id: p.id, quantity: 3, unit_price: "1250.255" }],
    };
    const before = await counts(pg);
    await api("sales", body, "POST", 400);
    assert.deepEqual(await counts(pg), before);
    assert.equal(
      (await api("storefront/orders/" + o.id)).snapshot.total,
      "3750.765",
    );
    body.items[0].unit_price = "1250.25";
    await pg.query("UPDATE products SET archived=true WHERE id=$1", [p.id]);
    await api("sales", body, "POST", 404);
    assert.deepEqual(await counts(pg), before);
    assert.equal((await api("storefront/orders/" + o.id)).status, "pending");
    await pg.query("UPDATE products SET archived=false WHERE id=$1", [p.id]);
    await api("sales", body);
    assert.deepEqual(
      (await api("storefront/orders/" + o.id)).snapshot.lines,
      receipt.lines,
    );
  } finally {
    await pg.end();
  }
});
test("fixed component drift is rejected inside transaction; explicit reviewed composition permits correction and repeated flavor combinations consume exact units", async () => {
  const pg = await pgConnect();
  try {
    const group = "Conversión sabores " + randomUUID();
    const a = await api("products", {
      name: "Whey Chocolate",
      variant_group: group,
      selling_price: "100",
    });
    const b = await api("products", {
      name: "Whey Vainilla",
      variant_group: group,
      selling_price: "100",
    });
    const fixed = await api("products", {
      name: "Shaker GEVA",
      selling_price: "50",
    });
    for (const p of [a, b, fixed])
      await api(`products/${p.id}/stock`, { quantity: 20 }, "PUT");
    const kit = await api("products", {
      name: "Combo Whey + Shaker",
      kind: "kit",
      kit_pricing_mode: "final",
      selling_price: "225",
      components: [
        { product_id: a.id, quantity: 2, variant_group: group },
        { product_id: fixed.id, quantity: 1 },
      ],
    });
    const s = await api("storefront/draft");
    const d = await api(
      "storefront/draft",
      {
        revision: s.revision,
        entries: [
          {
            kind: "promo",
            promoId: kit.id,
            title: "Combo Whey + Shaker",
            description: "",
            variantIds: [],
            promoComponents: [
              { componentId: a.id, variantIds: [a.id, b.id] },
              { componentId: fixed.id, variantIds: [fixed.id] },
            ],
            imageKey: null,
          },
        ],
      },
      "PUT",
    );
    await api("storefront/publish", { revision: d.revision });
    const receipt = await api("public/storefront/orders", {
      requestKey: randomUUID(),
      lines: [
        {
          kind: "promo",
          promoId: kit.id,
          quantity: 2,
          selections: [
            { componentId: a.id, unitIndex: 0, variantId: a.id },
            { componentId: a.id, unitIndex: 1, variantId: b.id },
            { componentId: fixed.id, unitIndex: 0, variantId: fixed.id },
          ],
        },
        {
          kind: "promo",
          promoId: kit.id,
          quantity: 1,
          selections: [
            { componentId: a.id, unitIndex: 0, variantId: b.id },
            { componentId: a.id, unitIndex: 1, variantId: b.id },
            { componentId: fixed.id, unitIndex: 0, variantId: fixed.id },
          ],
        },
      ],
    });
    const o = (await api("storefront/orders?q=" + receipt.number)).rows[0];
    const c = await api("customers", { name: "Cliente combo" });
    const body = {
      source_order_id: o.id,
      request_key: randomUUID(),
      sold_on: "2026-10-29",
      customer_id: c.id,
      items: [
        {
          product_id: kit.id,
          quantity: 2,
          unit_price: "225",
          selections: [
            { component_product_id: a.id, product_id: a.id, quantity: 1 },
            { component_product_id: a.id, product_id: b.id, quantity: 1 },
          ],
        },
        {
          product_id: kit.id,
          quantity: 1,
          unit_price: "225",
          selections: [
            { component_product_id: a.id, product_id: b.id, quantity: 2 },
          ],
        },
      ],
    };
    const before = await counts(pg);
    await pg.query(
      "UPDATE product_components SET quantity=2 WHERE kit_id=$1 AND product_id=$2",
      [kit.id, fixed.id],
    );
    await api("sales", body, "POST", 400);
    assert.deepEqual(await counts(pg), before);
    assert.equal((await api("storefront/orders/" + o.id)).status, "pending");
    for (const item of body.items)
      item.expected_components = [
        { componentProductId: a.id, quantity: 2, variantGroup: group },
        { componentProductId: fixed.id, quantity: 2, variantGroup: null },
      ];
    // A composition edit that wins the catalog lock after review must invalidate the submitted assertion.
    await pg.query("BEGIN");
    await pg.query("SELECT pg_advisory_xact_lock(713450)");
    const raced = api("sales", body, "POST", 400);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await pg.query(
      "UPDATE product_components SET quantity=3 WHERE kit_id=$1 AND product_id=$2",
      [kit.id, fixed.id],
    );
    await pg.query("COMMIT");
    await raced;
    assert.deepEqual(await counts(pg), before);
    await pg.query(
      "UPDATE product_components SET quantity=2 WHERE kit_id=$1 AND product_id=$2",
      [kit.id, fixed.id],
    );
    await api("sales", body);
    const products = await api("products");
    assert.equal(products.find((x) => x.id === a.id).own_stock, 18);
    assert.equal(products.find((x) => x.id === b.id).own_stock, 16);
    assert.equal(products.find((x) => x.id === fixed.id).own_stock, 14);
    assert.deepEqual(
      (await api("storefront/orders/" + o.id)).snapshot.lines,
      receipt.lines,
    );
    assert.equal(
      (await api("customers")).find((x) => x.id === c.id).balance,
      "675",
    );
  } finally {
    await pg.end();
  }
});
test("inbox pagination returns disjoint stable pages and converted/discarded filters", async () => {
  const { p } = await orderFixture();
  for (let i = 0; i < 26; i++)
    await api("public/storefront/orders", {
      requestKey: randomUUID(),
      lines: [
        {
          kind: "product",
          presentationId: p.presentation_id,
          variantId: p.id,
          quantity: 1,
        },
      ],
    });
  const first = await api("storefront/orders?status=pending&page=1");
  const second = await api("storefront/orders?status=pending&page=2");
  assert.equal(first.rows.length, 25);
  assert.ok(second.rows.length > 0);
  assert.ok(first.total >= 27);
  assert.equal(
    new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
    first.rows.length + second.rows.length,
  );
  assert.ok(first.rows.every((r) => r.status === "pending"));
  for (const status of ["converted", "discarded"]) {
    const result = await api("storefront/orders?status=" + status);
    assert.ok(result.rows.length > 0);
    assert.ok(result.rows.every((r) => r.status === status));
  }
  await api("storefront/orders?status=invalid", undefined, "GET", 400);
});
