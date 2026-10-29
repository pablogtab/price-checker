import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (
  !base ||
  new URL(base).hostname !== "127.0.0.1" ||
  !process.env.E2E_ALLOW_FIXTURES
)
  throw Error("isolated fixtures required");
async function api(path, body, method = "POST") {
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
  assert.ok(r.ok, await r.clone().text());
  return r.json();
}
async function fixture(quantity, extra = false, count = 1) {
  await api("storefront/whatsapp", { number: "12025550123" }, "PUT");
  let account = (await api("cash/accounts")).find(
    (a) => a.name === "Transferencia" && a.currency === "ARS",
  );
  if (!account)
    account = await api("cash/accounts", {
      name: "Transferencia",
      currency: "ARS",
      opening_balance: "0",
    });
  if (account.balance == null)
    await api(
      `cash/accounts/${account.id}/opening-balance`,
      { amount: "0" },
      "PUT",
    );
  const group = "Review " + randomUUID();
  const a = await api("products", {
    name: "Whey Chocolate",
    variant_group: group,
    selling_price: "1000",
  });
  const b = await api("products", {
    name: "Whey Vainilla",
    variant_group: group,
    selling_price: "1000",
  });
  const fixed = await api("products", {
    name: "Shaker GEVA",
    selling_price: "500",
  });
  for (const p of [a, b, fixed])
    await api(`products/${p.id}/stock`, { quantity: 1000 }, "PUT");
  const kit = await api("products", {
    name: "Doble Whey + Shaker",
    kind: "kit",
    kit_pricing_mode: "final",
    selling_price: "2500",
    components: [
      { product_id: a.id, quantity: 2, variant_group: group },
      { product_id: fixed.id, quantity: 1 },
    ],
  });
  const customer = await api("customers", {
    name: "Cliente revisión " + randomUUID().slice(0, 8),
  });
  const state = await api("storefront/draft");
  const draft = await api(
    "storefront/draft",
    {
      revision: state.revision,
      home: { banners: [], featuredIds: [] },
      entries: [
        {
          kind: "promo",
          promoId: kit.id,
          title: kit.name,
          description: "",
          imageKey: null,
          promoComponents: [
            { componentId: a.id, variantIds: [a.id, b.id] },
            { componentId: fixed.id, variantIds: [fixed.id] },
          ],
        },
        {
          presentationId: fixed.presentation_id,
          title: fixed.name,
          description: "",
          imageKey: null,
          variantIds: [fixed.id],
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: draft.revision });
  const line = {
    kind: "promo",
    promoId: kit.id,
    quantity,
    selections: [
      { componentId: a.id, unitIndex: 0, variantId: a.id },
      { componentId: a.id, unitIndex: 1, variantId: b.id },
      { componentId: fixed.id, unitIndex: 0, variantId: fixed.id },
    ],
  };
  const receipt = await api("public/storefront/orders", {
    requestKey: randomUUID(),
    lines: [
      ...Array.from({ length: count }, () => ({ ...line })),
      ...(extra
        ? [
            {
              kind: "product",
              presentationId: fixed.presentation_id,
              variantId: fixed.id,
              quantity: 1,
            },
          ]
        : []),
    ],
  });
  const id = (await api("storefront/orders?q=" + receipt.number)).rows[0].id;
  return { a, b, fixed, kit, customer, account, receipt, id };
}
for (const [quantity, extra] of [
  [101, false],
  [100, true],
])
  test(`source promo quantity ${quantity}${extra ? " plus product" : ""} reviews and registers exact stock, Caja and debt`, async () => {
    const f = await fixture(quantity, extra);
    const original = (await api("storefront/orders/" + f.id)).snapshot;
    const cashBefore = (await api("cash/accounts")).find(
      (a) => a.id === f.account.id,
    ).balance;
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_EXECUTABLE ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(base + "/sales/new?order=" + f.id);
      await page.getByLabel("Solicitud original").waitFor();
      // Corrections and reload keep the chosen combination without duplicating per-copy controls.
      const input = page.getByLabel("Cantidad", { exact: true }).first();
      await input.fill(String(quantity + 1));
      await input.blur();
      await input.fill(String(quantity));
      await input.blur();
      await page.reload();
      await page.getByLabel("Solicitud original").waitFor();
      await page
        .getByRole("button", { name: "Cliente: Consumidor final", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Elegir cliente" })
        .getByRole("button", { name: f.customer.name, exact: true })
        .click();
      const button = page.getByRole("button", {
        name: "Revisar venta",
        exact: true,
      });
      assert.equal(
        await button.isEnabled(),
        true,
        "valid accepted source quantity must be reviewable",
      );
      await button.click();
      const review = page.getByRole("dialog", {
        name: "Revisar venta",
        exact: true,
      });
      await review.waitFor();
      await review
        .getByRole("button", { name: "Transferencia", exact: true })
        .click();
      await review
        .getByRole("button", { name: "Cobrar una parte", exact: true })
        .click();
      await review
        .getByLabel("Cobrar ahora (ARS)", { exact: true })
        .fill("1000");
      assert.ok(
        (await page.locator("*").count()) < 2500,
        "bounded DOM for repeated quantity",
      );
      await page.screenshot({
        path: `/tmp/review-fix-${quantity}-desktop.png`,
        fullPage: true,
      });
      const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await mobile.goto(base + "/sales/new?order=" + f.id);
      await mobile.getByLabel("Solicitud original").waitFor();
      await mobile
        .getByRole("button", { name: "Revisar venta", exact: true })
        .click();
      await mobile
        .getByRole("dialog", { name: "Revisar venta", exact: true })
        .waitFor();
      await mobile
        .getByRole("dialog", { name: "Revisar venta", exact: true })
        .getByRole("button", { name: "Transferencia", exact: true })
        .click();
      await mobile.screenshot({
        path: `/tmp/review-fix-${quantity}-mobile-viewport.png`,
      });
      assert.equal(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await mobile.screenshot({
        path: `/tmp/review-fix-${quantity}-mobile.png`,
        fullPage: true,
      });
      let submitted;
      page.on("request", (r) => {
        if (r.method() === "POST" && new URL(r.url()).pathname === "/api/sales")
          submitted = r.postDataJSON();
      });
      await review
        .getByRole("button", { name: "Confirmar venta", exact: true })
        .click();
      await review.waitFor({ state: "hidden" });
      assert.equal(submitted.items.length, extra ? 2 : 1);
      assert.equal(submitted.items[0].quantity, quantity);
      assert.deepEqual(submitted.items[0].selections, [
        { component_product_id: f.a.id, product_id: f.a.id, quantity: 1 },
        { component_product_id: f.a.id, product_id: f.b.id, quantity: 1 },
      ]);
      const linked = await api("storefront/orders/" + f.id);
      assert.equal(linked.status, "converted");
      assert.deepEqual(linked.snapshot, original);
      const sale = (await api("sales")).find(
        (s) => s.id === Number(linked.sale_id),
      );
      assert.equal(sale.total, String(quantity * 2500 + (extra ? 500 : 0)));
      for (const [p, used] of [
        [f.a, quantity],
        [f.b, quantity],
        [f.fixed, quantity + (extra ? 1 : 0)],
      ])
        assert.equal(
          Number((await api("products")).find((v) => v.id === p.id).own_stock),
          1000 - used,
        );
      assert.equal(
        Number(
          (await api("cash/accounts")).find((a) => a.id === f.account.id)
            .balance,
        ),
        Number(cashBefore) + 1000,
      );
      assert.equal(
        (await api("customers/" + f.customer.id)).balance,
        String(quantity * 2500 + (extra ? 500 : 0) - 1000),
      );
    } finally {
      await browser.close();
    }
  });
test("maximum 100 source lines each repeating one million combinations has bounded review and sale payload", async () => {
  const f = await fixture(1000000, false, 100);
  const original = (await api("storefront/orders/" + f.id)).snapshot;
  const cashBefore = Number(
    (await api("cash/accounts")).find((a) => a.id === f.account.id).balance,
  );
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/sales/new?order=" + f.id);
    await page.getByLabel("Solicitud original").waitFor();
    assert.equal(
      await page.getByLabel("Cantidad", { exact: true }).count(),
      100,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Revisar venta", exact: true })
        .isEnabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const review = page.getByRole("dialog", {
      name: "Revisar venta",
      exact: true,
    });
    await review.waitFor();
    assert.ok((await page.locator("*").count()) < 10000);
    let payload;
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === "/api/sales")
        payload = r.postDataJSON();
    });
    await review
      .getByRole("button", { name: "Transferencia", exact: true })
      .click();
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.waitFor({ state: "hidden" });
    assert.equal(payload.items.length, 100);
    assert.ok(
      payload.items.every(
        (i) => i.quantity === 1000000 && i.selections.length === 2,
      ),
    );
    assert.equal((await api("storefront/orders/" + f.id)).status, "converted");
    const linked = await api("storefront/orders/" + f.id);
    assert.deepEqual(linked.snapshot, original);
    const sale = (await api("sales")).find(
      (s) => s.id === Number(linked.sale_id),
    );
    assert.equal(sale.items.length, 100);
    assert.equal(sale.total, "250000000000");
    assert.equal(sale.pending, "0");
    for (const p of [f.a, f.b, f.fixed])
      assert.equal(
        Number((await api("products")).find((v) => v.id === p.id).own_stock),
        -99999000,
      );
    assert.equal(
      Number(
        (await api("cash/accounts")).find((a) => a.id === f.account.id).balance,
      ),
      cashBefore + 250000000000,
    );
  } finally {
    await browser.close();
  }
});
