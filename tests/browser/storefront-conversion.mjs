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
async function fixture(price = "1250.25") {
  await api("storefront/whatsapp", { number: "12025550123" }, "PUT");
  const p = await api("products", {
    name: "Whey Protein Chocolate 1 kg",
    code: randomUUID(),
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
          title: "Whey Protein Chocolate · 1 kg",
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
  return {
    p,
    o,
    id: (await api("storefront/orders?q=" + o.number)).rows[0].id,
  };
}
test("private inbox renders anonymous pending orders and prepares original Nueva venta", async () => {
  await transfer();
  const fixtureOrder = await fixture();
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
    await page.goto(base + "/orders");
    await page.getByLabel("Buscar pedido").fill(fixtureOrder.o.number);
    await page
      .getByText("Sin datos de contacto", { exact: true })
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "Ver pedido", exact: true })
      .first()
      .click();
    await page.getByLabel("Detalle del pedido").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "/tmp/32-inbox-desktop-v5.png",
      fullPage: true,
    });
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await mobile.goto(base + "/orders");
    await mobile.getByLabel("Buscar pedido").fill(fixtureOrder.o.number);
    await mobile
      .getByRole("button", { name: "Ver pedido", exact: true })
      .first()
      .click();
    await mobile.getByLabel("Detalle del pedido").waitFor();
    await mobile.evaluate(() => document.fonts.ready);
    assert.equal(await mobile.locator("app-storefront-inbox").count(), 1);
    await mobile.screenshot({ path: "/tmp/32-inbox-mobile-viewport-v5.png" });
    await mobile.screenshot({
      path: "/tmp/32-inbox-mobile-v5.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Preparar Nueva venta", exact: true })
      .click();
    await page.waitForURL("**/sales/new?order=*");
    await page.getByLabel("Solicitud original").waitFor();
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .first()
        .inputValue(),
      "1250.25",
    );
    await page.screenshot({
      path: "/tmp/32-order-review-desktop-v5.png",
      fullPage: true,
    });
    await mobile
      .getByRole("button", { name: "Preparar Nueva venta", exact: true })
      .click();
    await mobile.getByLabel("Solicitud original").waitFor();
    await mobile.evaluate(() => document.fonts.ready);
    assert.equal(await mobile.locator("app-sales").count(), 1);
    assert.equal(await mobile.locator("h1").count(), 1);
    await mobile.screenshot({
      path: "/tmp/32-order-review-mobile-viewport-v5.png",
    });
    await mobile.screenshot({
      path: "/tmp/32-order-review-mobile-v5.png",
      fullPage: true,
    });
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  } finally {
    await browser.close();
  }
});
async function transfer() {
  let a = (await api("cash/accounts")).find(
    (a) => a.name === "Transferencia" && a.currency === "ARS",
  );
  if (!a)
    a = await api("cash/accounts", {
      name: "Transferencia",
      currency: "ARS",
      opening_balance: "0",
    });
  if (a.balance == null)
    await api(`cash/accounts/${a.id}/opening-balance`, { amount: "0" }, "PUT");
  return a;
}
async function openReview(page, id) {
  await page.goto(base + "/sales/new?order=" + id);
  await page.getByLabel("Solicitud original").waitFor();
  await page
    .getByRole("button", { name: "Revisar venta", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Revisar venta",
    exact: true,
  });
  await review.waitFor();
  await review
    .getByRole("button", { name: "Transferencia", exact: true })
    .click();
  return review;
}
test("two windows deliberately resolve distinct-key converted conflict; lost committed response reload recovers original source sale", async () => {
  await transfer();
  const f = await fixture();
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const c1 = await browser.newContext();
    const c2 = await browser.newContext();
    const p1 = await c1.newPage();
    const p2 = await c2.newPage();
    const r1 = await openReview(p1, f.id);
    const r2 = await openReview(p2, f.id);
    await r1
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await r1.waitFor({ state: "hidden" });
    await r2
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await r2.waitFor({ state: "hidden" });
    await p2.getByText(/desde otra ventana/).waitFor();
    assert.equal(
      await p2
        .getByText("El último envío está pendiente de verificar.", {
          exact: false,
        })
        .count(),
      0,
    );
    assert.equal(
      (await api("sales")).filter((s) =>
        s.items.some((i) => i.product_id === f.p.id),
      ).length,
      1,
    );
    const next = await fixture();
    const p3 = await c1.newPage();
    let lost = false;
    await p3.route("**/api/sales", async (route) => {
      if (route.request().method() !== "POST" || lost) return route.continue();
      lost = true;
      await route.fetch();
      await route.abort("failed");
    });
    const r3 = await openReview(p3, next.id);
    await r3
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await r3.getByRole("alert").waitFor();
    await p3.reload();
    await p3
      .getByRole("button", { name: "Verificar envío pendiente", exact: true })
      .click();
    await p3
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await p3
      .getByRole("dialog", { name: "Revisar venta", exact: true })
      .waitFor({ state: "hidden" });
    const rows = (await api("sales")).filter((s) =>
      s.items.some((i) => i.product_id === next.p.id),
    );
    assert.equal(rows.length, 1);
    assert.equal(
      (await api("storefront/orders/" + next.id)).sale_id,
      rows[0].id,
    );
    assert.equal(
      (await api("products")).find((p) => p.id === next.p.id).own_stock,
      7,
    );
  } finally {
    await browser.close();
  }
});
test("unrelated draft requires explicit decision; original precision is actionable and cancel preparation keeps pending", async () => {
  const f = await fixture("1250.255");
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/sales/new");
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .fill("Whey Protein Chocolate 1 kg");
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .press("Enter");
    await page.getByLabel("Precio unitario (ARS)", { exact: true }).fill("999");
    await page.goto(base + "/sales/new?order=" + f.id);
    await page
      .getByRole("button", { name: "Conservar borrador actual", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "999",
    );
    assert.equal((await api("storefront/orders/" + f.id)).status, "pending");
    await page.goto(base + "/sales/new?order=" + f.id);
    await page
      .getByRole("button", {
        name: "Descartar borrador y preparar pedido",
        exact: true,
      })
      .click();
    await page
      .getByText(/acordá un precio en ARS con hasta dos decimales/)
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "1250.255",
    );
    assert.match(
      await page.getByLabel("Solicitud original").innerText(),
      /3\.750,765/,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Revisar venta", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByLabel("Precio unitario (ARS)", { exact: true })
      .fill("1250.25");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Volver al carrito", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancelar preparación", exact: true })
      .click();
    await page
      .getByText("Preparación cancelada. El pedido sigue pendiente.")
      .waitFor();
    assert.equal((await api("storefront/orders/" + f.id)).status, "pending");
    assert.equal(
      (await api("storefront/orders/" + f.id)).snapshot.total,
      "3750.765",
    );
  } finally {
    await browser.close();
  }
});
test("original promo combinations load as separate repeated lines and fixed composition change requires explicit review", async () => {
  await transfer();
  const group = "Whey aislada " + randomUUID();
  const a = await api("products", {
    name: "Chocolate",
    variant_group: group,
    selling_price: "100",
  });
  const b = await api("products", {
    name: "Vainilla",
    variant_group: group,
    selling_price: "100",
  });
  const fixed = await api("products", {
    name: "Shaker GEVA 600 ml",
    selling_price: "50",
  });
  for (const p of [a, b, fixed])
    await api(`products/${p.id}/stock`, { quantity: 20 }, "PUT");
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
  const s = await api("storefront/draft");
  const d = await api(
    "storefront/draft",
    {
      revision: s.revision,
      entries: [
        {
          kind: "promo",
          promoId: kit.id,
          title: "Doble Whey + Shaker",
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
  const selection = (ids) =>
    ids
      .map((variantId, unitIndex) => ({
        componentId: a.id,
        unitIndex,
        variantId,
      }))
      .concat([{ componentId: fixed.id, unitIndex: 0, variantId: fixed.id }]);
  const original = await api("public/storefront/orders", {
    requestKey: randomUUID(),
    lines: [
      {
        kind: "promo",
        promoId: kit.id,
        quantity: 2,
        selections: selection([a.id, b.id]),
      },
      {
        kind: "promo",
        promoId: kit.id,
        quantity: 1,
        selections: selection([b.id, b.id]),
      },
    ],
  });
  const id = (await api("storefront/orders?q=" + original.number)).rows[0].id;
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/sales/new?order=" + id);
    await page.getByLabel("Solicitud original").waitFor();
    assert.deepEqual(
      await page
        .getByLabel("Cantidad", { exact: true })
        .evaluateAll((inputs) => inputs.map((i) => i.value)),
      ["2", "1"],
    );
    assert.equal(
      await page.getByLabel("Precio unitario (ARS)", { exact: true }).count(),
      2,
    );
    await api(
      "products/" + kit.id,
      {
        name: kit.name,
        components: [
          { product_id: a.id, quantity: 2, variant_group: group },
          { product_id: fixed.id, quantity: 2 },
        ],
      },
      "PUT",
    );
    await page.reload();
    await page.getByText(/cambiaron los componentes/).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Revisar venta", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal((await api("storefront/orders/" + id)).status, "pending");
    await page
      .getByRole("button", { name: "Cancelar preparación", exact: true })
      .click();
    // Restore original catalog composition and load the same preserved request.
    await api(
      "products/" + kit.id,
      {
        name: kit.name,
        components: [
          { product_id: a.id, quantity: 2, variant_group: group },
          { product_id: fixed.id, quantity: 1 },
        ],
      },
      "PUT",
    );
    const review = await openReview(page, id);
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.waitFor({ state: "hidden" });
    const linked = await api("storefront/orders/" + id);
    const sale = (await api("sales")).find(
      (s) => s.id === Number(linked.sale_id),
    );
    assert.ok(sale);
    const units = sale.items
      .flatMap((i) => i.components)
      .reduce(
        (acc, c) => (
          (acc[c.product_id] = (acc[c.product_id] || 0) + c.quantity),
          acc
        ),
        {},
      );
    assert.deepEqual(units, { [a.id]: 2, [b.id]: 4, [fixed.id]: 3 });
    assert.equal(sale.total, "7500");
    assert.deepEqual(
      (await api("storefront/orders/" + id)).snapshot.lines,
      original.lines,
    );
  } finally {
    await browser.close();
  }
});
