import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL;
if (!base || new URL(base).hostname !== "127.0.0.1")
  throw Error("local API required");
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
test("pending request snapshots money and replays before catalog eligibility; opaque recovery and no premature sale", async () => {
  await api("storefront/whatsapp", { number: "12025550123" }, "PUT");
  await api("storefront/whatsapp", { number: "javascript:123" }, "PUT", 400);
  const p = await api("products", {
    name: "Chocolate " + Date.now(),
    selling_price: "1250.25",
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
  const lines = [
    {
      kind: "product",
      presentationId: p.presentation_id,
      variantId: p.id,
      quantity: 3,
    },
  ];
  const requestKey = randomUUID();
  const before = await api("sales");
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      api("public/storefront/orders", { requestKey, lines }),
    ),
  );
  const order = results[0];
  for (const r of results) assert.deepEqual(r, order);
  assert.equal(order.total, "3750.75");
  assert.equal(order.status, "pending");
  assert.match(order.number, /^GEVA-/);
  assert.match(order.message, /3 × Whey Protein 1 kg/);
  assert.match(order.message, /3\.750,75/);
  assert.equal(
    new URL(order.whatsappUrl).searchParams.get("text"),
    order.message,
  );
  assert.deepEqual(
    await api("public/storefront/orders/requests/" + requestKey),
    order,
  );
  assert.deepEqual(
    await api("public/storefront/orders/receipts/" + order.receipt),
    order,
  );
  await api(
    "public/storefront/orders/receipts/" + "a".repeat(64),
    undefined,
    "GET",
    404,
  );
  await api(
    "public/storefront/orders",
    { requestKey, lines: [{ ...lines[0], quantity: 4 }] },
    "POST",
    409,
  );
  await api(`products/${p.id}/selling-price`, { selling_price: "1500" }, "PUT");
  await api(`products/${p.id}/stock`, { quantity: 0 }, "PUT");
  assert.deepEqual(
    await api("public/storefront/orders", {
      requestKey,
      lines: lines.map((l) => ({ ...l, price: "0" })),
    }),
    order,
  );
  await api(
    "public/storefront/orders",
    { requestKey: randomUUID(), lines },
    "POST",
    400,
  );
  assert.deepEqual(await api("sales"), before);
  const after = await api("products");
  assert.equal(after.find((v) => v.id === p.id).own_stock, 0);
  assert.ok(
    !/"(?:cost|margin|customer|fingerprint)"/.test(JSON.stringify(order)),
  );
  await api(
    "public/storefront/orders",
    { requestKey: randomUUID(), lines: [] },
    "POST",
    400,
  );
});

test("failed insert rolls back the pending request and business effects; retry remains safe", async () => {
  const { Client } = await import("pg");
  const url = process.env.TEST_STOREFRONT_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith("_test") ||
    new URL(url).hostname !== "127.0.0.1"
  )
    throw Error("disposable database required");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const p = await api("products", {
      name: "Banana",
      selling_price: "100.10",
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
            title: "Whey Protein Banana · 1 kg",
            description: "",
            variantIds: [p.id],
            imageKey: null,
          },
        ],
      },
      "PUT",
    );
    await api("storefront/publish", { revision: d.revision });
    const requestKey = randomUUID(),
      lines = [
        {
          kind: "product",
          presentationId: p.presentation_id,
          variantId: p.id,
          quantity: 100,
        },
      ];
    const counts = async () => {
      const out = {};
      for (const table of [
        "sales",
        "sale_items",
        "sale_components",
        "sale_payments",
        "customers",
        "cash_operations",
        "cash_entries",
        "stock_movements",
      ])
        out[table] = (
          await pg.query(`SELECT count(*)::int n FROM ${table}`)
        ).rows[0].n;
      return out;
    };
    const before = await counts();
    const stocks = (
      await pg.query("SELECT id,own_stock FROM products ORDER BY id")
    ).rows;
    await pg.query(
      "CREATE FUNCTION storefront_order_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable insert failure'; END $$; CREATE TRIGGER storefront_order_test_failure BEFORE INSERT ON storefront_orders FOR EACH ROW EXECUTE FUNCTION storefront_order_test_failure()",
    );
    try {
      await api("public/storefront/orders", { requestKey, lines }, "POST", 500);
    } finally {
      await pg.query(
        "DROP TRIGGER storefront_order_test_failure ON storefront_orders; DROP FUNCTION storefront_order_test_failure()",
      );
    }
    await api(
      "public/storefront/orders/requests/" + requestKey,
      undefined,
      "GET",
      404,
    );
    const result = await api("public/storefront/orders", { requestKey, lines });
    assert.equal(result.total, "10010");
    assert.deepEqual(await counts(), before);
    assert.deepEqual(
      (await pg.query("SELECT id,own_stock FROM products ORDER BY id")).rows,
      stocks,
    );
    assert.equal(
      (
        await pg.query(
          "SELECT count(*)::int n FROM storefront_orders WHERE request_key=$1",
          [requestKey],
        )
      ).rows[0].n,
      1,
    );
    const [row] = (
      await pg.query(
        "SELECT request_payload,fulfillment FROM storefront_orders WHERE request_key=$1",
        [requestKey],
      )
    ).rows;
    assert.deepEqual(row.request_payload, lines);
    assert.equal(row.fulfillment[0].variantId, p.id);
  } finally {
    await pg.end();
  }
});

test("order prices and messages share one catalog snapshot during concurrent price changes", async () => {
  const p = await api("products", {
    name: "Vainilla",
    selling_price: "100.10",
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
          title: "Whey Protein Vainilla · 1 kg",
          description: "",
          variantIds: [p.id],
          imageKey: null,
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const lines = Array.from({ length: 2 }, () => ({
    kind: "product",
    presentationId: p.presentation_id,
    variantId: p.id,
    quantity: 2,
  }));
  await Promise.all([
    api(`products/${p.id}/selling-price`, { selling_price: "200.20" }, "PUT"),
    ...Array.from({ length: 6 }, () =>
      api("public/storefront/orders", { requestKey: randomUUID(), lines }).then(
        (o) => {
          assert.ok(["400.4", "800.8"].includes(o.total));
          assert.equal(o.lines[0].price, o.lines[1].price);
          assert.ok(
            o.message.includes(o.total === "400.4" ? "$ 400,40" : "$ 800,80"),
          );
        },
      ),
    ),
  ]);
});

test("promo receipt preserves every unit choice and private fixed composition independently of later edits", async () => {
  const { Client } = await import("pg");
  const url = process.env.TEST_STOREFRONT_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith("_test") ||
    new URL(url).hostname !== "127.0.0.1"
  )
    throw Error("disposable database required");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const group = "Whey combo " + Date.now(),
      a = await api("products", {
        name: "Chocolate",
        variant_group: group,
        selling_price: "1000",
      }),
      b = await api("products", {
        name: "Banana",
        variant_group: group,
        selling_price: "1000",
      }),
      fixed = await api("products", {
        name: "Creatina 300 g",
        selling_price: "500",
      });
    for (const p of [a, b, fixed])
      await api(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    const [kit] = (
      await pg.query(
        "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,position) VALUES('Doble whey + creatina','kit',2500,'final',999) RETURNING id",
      )
    ).rows;
    await pg.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,$3),($1,$4,1,NULL)",
      [kit.id, a.id, group, fixed.id],
    );
    const s = await api("storefront/draft");
    const d = await api(
      "storefront/draft",
      {
        revision: s.revision,
        entries: [
          {
            kind: "promo",
            promoId: kit.id,
            title: "Doble whey + creatina",
            description: "",
            imageKey: null,
            promoComponents: [
              { componentId: a.id, variantIds: [a.id, b.id] },
              { componentId: fixed.id, variantIds: [fixed.id] },
            ],
          },
        ],
      },
      "PUT",
    );
    await api("storefront/publish", { revision: d.revision });
    const requestKey = randomUUID(),
      lines = [
        {
          kind: "promo",
          promoId: kit.id,
          selections: [
            { componentId: a.id, unitIndex: 0, variantId: b.id },
            { componentId: a.id, unitIndex: 1, variantId: a.id },
            { componentId: fixed.id, unitIndex: 0, variantId: fixed.id },
          ],
          quantity: 3,
        },
      ];
    const order = await api("public/storefront/orders", { requestKey, lines });
    assert.equal(order.total, "7500");
    assert.equal(order.lines[0].labels.length, 3);
    assert.match(order.message, /1: Banana/);
    assert.match(order.message, /2: Chocolate/);
    assert.match(order.message, /Creatina 300 g/);
    const [row] = (
      await pg.query(
        "SELECT fulfillment FROM storefront_orders WHERE request_key=$1",
        [requestKey],
      )
    ).rows;
    assert.deepEqual(row.fulfillment[0].components, [
      { componentProductId: a.id, quantity: 2, variantGroup: group },
      { componentProductId: fixed.id, quantity: 1, variantGroup: null },
    ]);
    await pg.query(
      "UPDATE product_components SET quantity=2 WHERE kit_id=$1 AND product_id=$2",
      [kit.id, fixed.id],
    );
    assert.deepEqual(
      await api("public/storefront/orders", { requestKey, lines }),
      order,
    );
    assert.deepEqual(
      (
        await pg.query(
          "SELECT fulfillment FROM storefront_orders WHERE request_key=$1",
          [requestKey],
        )
      ).rows[0],
      row,
    );
    assert.ok(!JSON.stringify(order).includes("variantGroup"));
  } finally {
    await pg.end();
  }
});

test("receipt message never rounds away precision accepted by catalog prices", async () => {
  const p = await api("products", {
    name: "Chocolate",
    selling_price: "1250.255",
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
          title: "Whey 1 kg",
          description: "",
          variantIds: [p.id],
          imageKey: null,
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const o = await api("public/storefront/orders", {
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
  assert.equal(o.total, "3750.765");
  assert.match(o.message, /Precio unitario: \$ 1\.250,255/);
  assert.match(o.message, /Total de productos: \$ 3\.750,765/);
});
