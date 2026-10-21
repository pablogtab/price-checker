import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Disposable local API required");
async function req(
  path,
  body,
  method = "POST",
  status = body === undefined ? 200 : 201,
) {
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
  assert.equal(r.status, status, JSON.stringify(v));
  return v;
}
test("edit keeps sale identity and historical price, moves debt and applies stock delta to current stock", async () => {
  const c = await req("customers", { name: "Edit old " + Date.now() }),
    d = await req("customers", { name: "Edit new " + Date.now() });
  const p = await req("products", {
    name: "Historical " + Date.now(),
    selling_price: "100",
  });
  await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: p.id, quantity: 2, unit_price: "100" }],
  });
  const original = (await req("sales", undefined)).find((x) => x.id === s.id);
  await req(`products/${p.id}/stock`, { quantity: 30 }, "PUT", 200);
  const edit = {
    customer_id: d.id,
    sold_on: "2026-10-20",
    note: "Corrected",
    discount: { mode: "percent", value: "10" },
    items: [{ id: original.items[0].id, product_id: p.id, quantity: 3 }],
  };
  const preview = await req(`sales/${s.id}/edit/preview`, edit);
  assert.equal(preview.after.total, "270");
  assert.equal(preview.stock[0].before, 30);
  assert.equal(preview.stock[0].after, 29);
  const body = {
    ...edit,
    preview_token: preview.preview_token,
    request_key: randomUUID(),
  };
  await req(`sales/${s.id}/edits`, body);
  await req(`sales/${s.id}/edits`, body);
  const updated = (await req("sales", undefined)).find((x) => x.id === s.id);
  assert.equal(updated.total, "270");
  assert.equal(updated.items[0].unit_price, "100");
  assert.equal(updated.cost_total, null);
  assert.equal(updated.customer_id, d.id);
  const clients = await req("customers", undefined);
  assert.equal(clients.find((x) => x.id === c.id).balance, "0");
  assert.equal(clients.find((x) => x.id === d.id).balance, "270");
});
test("retained legacy promo uses actual flavors after recipe changes; substitutions/new items use current values and cent discounts", async () => {
  const tag = Date.now(),
    group = "Edit flavors " + tag;
  const c = await req("customers", { name: "Promo editor " + tag });
  const a = await req("products", {
      name: "Flavor A " + tag,
      selling_price: "10.01",
      variant_group: group,
    }),
    b = await req("products", {
      name: "Flavor B " + tag,
      selling_price: "20.02",
      variant_group: group,
    });
  for (const p of [a, b])
    await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const kit = await req("products", {
    name: "Historical promo " + tag,
    kind: "kit",
    selling_price: "30.03",
    kit_pricing_mode: "final",
    components: [{ variant_group: group, quantity: 2 }],
  });
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [
      {
        product_id: kit.id,
        quantity: 1,
        unit_price: "30.03",
        selections: [
          { component_product_id: a.id, product_id: a.id, quantity: 1 },
          { component_product_id: a.id, product_id: b.id, quantity: 1 },
        ],
      },
    ],
  });
  const old = (await req("sales")).find((x) => x.id === s.id);
  await req(
    `products/${kit.id}`,
    {
      name: "Changed recipe " + tag,
      kind: "kit",
      selling_price: "99",
      kit_pricing_mode: "final",
      components: [{ product_id: a.id, quantity: 7 }],
    },
    "PUT",
    200,
  );
  await req(
    `products/${a.id}/selling-price`,
    { selling_price: "50" },
    "PUT",
    200,
  );
  const body = {
    customer_id: c.id,
    sold_on: "2026-10-19",
    discount: { mode: "amount", value: "0.01" },
    items: [
      {
        id: old.items[0].id,
        product_id: kit.id,
        quantity: 2,
        replacements: [{ original_product_id: b.id, product_id: a.id }],
      },
      { product_id: a.id, quantity: 1 },
    ],
  };
  const p = await req(`sales/${s.id}/edit/preview`, body);
  assert.equal(p.after.total, "110.05");
  await req(`sales/${s.id}/edits`, {
    ...body,
    preview_token: p.preview_token,
    request_key: randomUUID(),
  });
  const after = (await req("sales")).find((x) => x.id === s.id);
  assert.equal(after.items[0].unit_price, "30.03");
  assert.equal(after.items[1].unit_price, "50");
  assert.equal(
    after.items[0].components.reduce((s, c) => s + c.quantity, 0),
    4,
  );
  assert.equal(
    after.items[0].components.every((c) => c.product_id === a.id),
    true,
  );
  const products = await req("products");
  assert.equal(products.find((p) => p.id === a.id).own_stock, 5);
  assert.equal(products.find((p) => p.id === b.id).own_stock, 10);
});
test("stale previews, concurrent collections and injected failures preserve complete sale/stock/debt", async () => {
  const tag = Date.now(),
    c = await req("customers", { name: "Concurrent edit " + tag }),
    p = await req("products", {
      name: "Concurrent item " + tag,
      selling_price: "100",
    }),
    a = await req("cash/accounts", {
      name: "Edit cash " + tag,
      currency: "ARS",
      opening_balance: "0",
    });
  await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: p.id, quantity: 1 }],
  });
  const old = (await req("sales")).find((x) => x.id === s.id);
  const body = {
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ id: old.items[0].id, product_id: p.id, quantity: 2 }],
  };
  const prev = await req(`sales/${s.id}/edit/preview`, body);
  await req(`products/${p.id}/stock`, { quantity: 20 }, "PUT", 200);
  await req(
    `sales/${s.id}/edits`,
    { ...body, request_key: randomUUID(), preview_token: prev.preview_token },
    "POST",
    409,
  );
  const valid = await req(`sales/${s.id}/edit/preview`, body);
  const { execFileSync } = await import("node:child_process");
  const db = process.env.TEST_EDIT_DATABASE || "ventas_ticket8_test";
  assert.match(db, /^[a-z0-9_]+_test$/);
  const sql = (text) =>
    execFileSync("docker", [
      "exec",
      "price-checker-db-1",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "price_checker",
      "-d",
      db,
      "-c",
      text,
    ]);
  sql(
    "CREATE FUNCTION edit_fail_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;CREATE TRIGGER edit_fail BEFORE INSERT ON sale_corrections FOR EACH ROW EXECUTE FUNCTION edit_fail_test();",
  );
  try {
    await req(
      `sales/${s.id}/edits`,
      {
        ...body,
        request_key: randomUUID(),
        preview_token: valid.preview_token,
      },
      "POST",
      500,
    );
  } finally {
    sql(
      "DROP TRIGGER edit_fail ON sale_corrections;DROP FUNCTION edit_fail_test();",
    );
  }
  assert.equal(
    (await req("products")).find((x) => x.id === p.id).own_stock,
    20,
  );
  assert.equal((await req("sales")).find((x) => x.id === s.id).total, "100");
  await req(`sales/${s.id}/payments`, {
    request_key: randomUUID(),
    account_id: a.id,
    amount: "1",
    occurred_on: "2026-10-21",
  });
  await req(
    `sales/${s.id}/edits`,
    { ...body, request_key: randomUUID(), preview_token: valid.preview_token },
    "POST",
    409,
  );
  await req(`sales/${s.id}/edit/preview`, body, "POST", 400);
  assert.equal((await req("sales")).find((x) => x.id === s.id).paid, "1");
  assert.equal(
    (await req("products")).find((x) => x.id === p.id).own_stock,
    20,
  );
});
test("historical known component cost survives archived product and quantity edits", async () => {
  const tag = Date.now(),
    c = await req("customers", { name: "Archive editor " + tag }),
    p = await req("products", {
      name: "Archived historical " + tag,
      selling_price: "100",
    });
  await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: p.id, quantity: 2 }],
  });
  // Fixture represents a sale recorded with a known historical provider cost.
  const { execFileSync } = await import("node:child_process");
  const db = process.env.TEST_EDIT_DATABASE || "ventas_ticket8_test";
  assert.match(db, /^[a-z0-9_]+_test$/);
  execFileSync("docker", [
    "exec",
    "price-checker-db-1",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "price_checker",
    "-d",
    db,
    "-c",
    `UPDATE sale_components SET unit_cost=25 WHERE sale_item_id IN(SELECT id FROM sale_items WHERE sale_id=${s.id});UPDATE sale_items SET cost_total=50 WHERE sale_id=${s.id};UPDATE sales SET cost_total=50 WHERE id=${s.id};UPDATE products SET archived=true WHERE id=${p.id};`,
  ]);
  const old = (await req("sales")).find((x) => x.id === s.id);
  const edit = {
    customer_id: c.id,
    sold_on: "2026-10-20",
    items: [{ id: old.items[0].id, product_id: p.id, quantity: 3 }],
  };
  const preview = await req(`sales/${s.id}/edit/preview`, edit);
  await req(`sales/${s.id}/edits`, {
    ...edit,
    request_key: randomUUID(),
    preview_token: preview.preview_token,
  });
  const after = (await req("sales")).find((x) => x.id === s.id);
  assert.equal(after.cost_total, "75");
  assert.equal(after.items[0].components[0].unit_cost, "25");
  assert.equal(after.items[0].unit_price, "100");
});
test("split original same-flavor x2 into separate flavor slots preserves retained cost and uses current substitute cost", async () => {
  const tag = Date.now(),
    group = "Split edit " + tag,
    c = await req("customers", { name: "Split customer " + tag });
  const a = await req("products", {
      name: "Split A " + tag,
      selling_price: "100",
      variant_group: group,
    }),
    b = await req("products", {
      name: "Split B " + tag,
      selling_price: "100",
      variant_group: group,
    });
  for (const p of [a, b])
    await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const { execFileSync } = await import("node:child_process");
  const db = process.env.TEST_EDIT_DATABASE || "ventas_ticket8_test";
  assert.match(db, /^[a-z0-9_]+_test$/);
  const sql = (text) =>
    execFileSync("docker", [
      "exec",
      "price-checker-db-1",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "price_checker",
      "-d",
      db,
      "-c",
      text,
    ]);
  for (const [p, cost] of [
    [a, 25],
    [b, 35],
  ])
    sql(
      `WITH item AS(INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES(1,'split-${p.id}-${tag}','Fixture','Test','Test','ARS',${cost},${cost},10,false,false,now()) RETURNING id) INSERT INTO product_links(product_id,provider_id,individual_item_id) SELECT ${p.id},1,id FROM item;`,
    );
  const kit = await req("products", {
    name: "Split promo " + tag,
    kind: "kit",
    selling_price: "180",
    kit_pricing_mode: "final",
    components: [{ variant_group: group, quantity: 2 }],
  });
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [
      {
        product_id: kit.id,
        quantity: 1,
        selections: [
          { component_product_id: a.id, product_id: a.id, quantity: 2 },
        ],
      },
    ],
  });
  const old = (await req("sales")).find((x) => x.id === s.id);
  assert.equal(old.cost_total, "50");
  sql(
    `UPDATE supplier_items SET price=50,source_price=50 WHERE external_id='split-${a.id}-${tag}';`,
  );
  const original = old.items[0].components[0];
  const body = {
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [
      {
        id: old.items[0].id,
        product_id: kit.id,
        quantity: 1,
        replacements: [
          { original_component_id: original.id, product_id: a.id, quantity: 1 },
          { original_component_id: original.id, product_id: b.id, quantity: 1 },
        ],
      },
    ],
  };
  const preview = await req(`sales/${s.id}/edit/preview`, body);
  assert.equal(preview.after.cost_total, "60");
  await req(`sales/${s.id}/edits`, {
    ...body,
    request_key: randomUUID(),
    preview_token: preview.preview_token,
  });
  const after = (await req("sales")).find((x) => x.id === s.id);
  assert.equal(
    after.items[0].components.find((c) => c.product_id === a.id).unit_cost,
    "25",
  );
  assert.equal(
    after.items[0].components.find((c) => c.product_id === b.id).unit_cost,
    "35",
  );
  const ps = await req("products");
  assert.equal(ps.find((p) => p.id === a.id).own_stock, 9);
  assert.equal(ps.find((p) => p.id === b.id).own_stock, 9);
});
test("removing a historical line restores only its consumed units and leaves kept item identity", async () => {
  const c = await req("customers", { name: "Remove customer " + Date.now() }),
    a = await req("products", {
      name: "Remove item " + Date.now(),
      selling_price: "10",
    }),
    b = await req("products", {
      name: "Keep item " + Date.now(),
      selling_price: "20",
    });
  for (const p of [a, b])
    await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [
      { product_id: a.id, quantity: 2 },
      { product_id: b.id, quantity: 1 },
    ],
  });
  const old = (await req("sales")).find((x) => x.id === s.id),
    keep = old.items[1];
  const body = {
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ id: keep.id, product_id: b.id, quantity: 1 }],
  };
  const preview = await req(`sales/${s.id}/edit/preview`, body);
  await req(`sales/${s.id}/edits`, {
    ...body,
    preview_token: preview.preview_token,
    request_key: randomUUID(),
  });
  const after = (await req("sales")).find((x) => x.id === s.id);
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].id, keep.id);
  const products = await req("products");
  assert.equal(products.find((p) => p.id === a.id).own_stock, 10);
  assert.equal(products.find((p) => p.id === b.id).own_stock, 9);
});
test("annulled sales remain historical and cannot enter unpaid editor", async () => {
  const c = await req("customers", { name: "Annul edit " + Date.now() }),
    p = await req("products", {
      name: "Annul item " + Date.now(),
      selling_price: "10",
    });
  await req(`products/${p.id}/stock`, { quantity: 10 }, "PUT", 200);
  const s = await req("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: p.id, quantity: 1 }],
  });
  const old = (await req("sales")).find((x) => x.id === s.id),
    preview = await req(`sales/${s.id}/annul/preview`, {});
  await req(`sales/${s.id}/annul`, {
    preview_token: preview.preview_token,
    request_key: randomUUID(),
  });
  await req(
    `sales/${s.id}/edit/preview`,
    {
      customer_id: c.id,
      sold_on: "2026-10-21",
      items: [{ id: old.items[0].id, product_id: p.id, quantity: 2 }],
    },
    "POST",
    400,
  );
  assert.equal(
    (await req("sales")).find((x) => x.id === s.id).status,
    "annulled",
  );
});
