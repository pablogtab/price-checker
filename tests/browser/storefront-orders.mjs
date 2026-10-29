import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.PUBLIC_STOREFRONT_URL,
  apiBase = process.env.TEST_API_URL;
if (![base, apiBase].every((v) => v && new URL(v).hostname === "127.0.0.1"))
  throw Error("local required");
async function api(path, body, method = "POST") {
  const r = await fetch(
    apiBase + "/api/" + path,
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
test("visitor recovers lost committed response after reload and reopens exact WhatsApp message without duplicate", async () => {
  await api("storefront/whatsapp", { number: "12025550123" }, "PUT");
  const asset = await api("media", {
    name: "Whey Protein Chocolate · foto",
    data:
      "data:image/png;base64," +
      (
        await readFile(
          process.env.STOREFRONT_FIXTURE_IMAGE ||
            new URL("../fixtures/media.jpg", import.meta.url),
        )
      ).toString("base64"),
  });
  const p = await api("products", {
    name: "Chocolate",
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
          title: "Whey Protein Chocolate · 1 kg",
          description: "Proteína en polvo",
          variantIds: [p.id],
          imageKey: null,
          gallery: [asset.id],
          coverMediaId: asset.id,
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    await context.route("https://wa.me/**", (r) =>
      r.fulfill({
        status: 200,
        body: "External navigation intercepted; no message sent.",
      }),
    );
    await page.goto(base + "/products/" + p.presentation_id);
    await page
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click();
    await page.getByRole("link", { name: /^Ver carrito/ }).click();
    let key;
    await page.route("**/api/public/storefront/orders", async (route) => {
      key = route.request().postDataJSON().requestKey;
      await route.fetch();
      await route.abort();
    });
    await page.locator(".cart-photo").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
    });
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/31-checkout-cart-photo-desktop-final-v4.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Continuar por WhatsApp", exact: true })
      .click();
    await page.getByText(/No se pudo recuperar el pedido/).waitFor();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gevafit-public-submission-v1")),
    );
    assert.equal(stored.requestKey, key);
    await page.unroute("**/api/public/storefront/orders");
    await page.reload();
    await page.getByRole("heading", { name: /Pedido GEVA-/ }).waitFor();
    const number = await page
      .getByRole("heading", { name: /Pedido GEVA-/ })
      .textContent();
    assert.match(
      await page
        .getByRole("link", { name: "Abrir WhatsApp", exact: true })
        .getAttribute("href"),
      /^https:\/\/wa.me\/12025550123\?text=/,
    );
    await page.locator(".cart-photo").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
    });
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/31-order-receipt-photo-desktop-final-v4.png",
      fullPage: true,
    });
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("link", { name: "Abrir WhatsApp", exact: true })
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.match(popup.url(), /^https:\/\/wa.me\//);
    await popup.close();
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(base + "/cart");
    await mobile.getByRole("heading", { name: /Pedido GEVA-/ }).waitFor();
    assert.equal(
      await mobile.getByRole("heading", { name: /Pedido GEVA-/ }).textContent(),
      number,
    );
    assert.equal(await mobile.locator("header").count(), 1);
    assert.ok(
      await mobile.evaluate(() => document.documentElement.scrollWidth <= 390),
    );
    await mobile.locator(".cart-photo").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
    });
    await mobile.screenshot({
      path: "/tmp/gevafit-storefront-context/31-order-receipt-photo-mobile-final-v4.png",
      fullPage: true,
    });
    await mobile
      .getByRole("button", { name: "Copiar mensaje", exact: true })
      .click();
    await mobile.getByLabel("Mensaje del pedido").waitFor();
    const original = await api("public/storefront/orders/requests/" + key);
    assert.equal(
      await mobile.getByLabel("Mensaje del pedido").inputValue(),
      original.message,
    );
    assert.equal(await mobile.locator("input").count(), 0);
    await mobile
      .getByRole("button", { name: "Nueva compra", exact: true })
      .click();
    await mobile.getByText("Tu carrito está vacío.", { exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});

test("owner configures WhatsApp privately; public error retains cart and retry key across two windows", async () => {
  const privateBase = process.env.E2E_BASE_URL;
  if (!privateBase || new URL(privateBase).hostname !== "127.0.0.1")
    throw Error("local private required");
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const owner = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    owner.setDefaultTimeout(6000);
    await owner.goto(privateBase + "/store");
    await owner
      .getByLabel("Número de WhatsApp", { exact: true })
      .fill("invalid");
    await owner
      .getByRole("button", { name: "Guardar WhatsApp", exact: true })
      .click();
    await owner
      .getByRole("alert")
      .filter({ hasText: /número internacional/ })
      .waitFor();
    await owner
      .getByLabel("Número de WhatsApp", { exact: true })
      .fill("12025550123");
    await owner
      .getByRole("button", { name: "Guardar WhatsApp", exact: true })
      .click();
    await owner.getByText("WhatsApp guardado.", { exact: true }).waitFor();
    await owner.screenshot({
      path: "/tmp/gevafit-storefront-context/31-whatsapp-owner-desktop-final-v4.png",
      fullPage: false,
    });
    const ownerMobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await ownerMobile.goto(privateBase + "/store");
    await ownerMobile
      .getByLabel("Número de WhatsApp", { exact: true })
      .waitFor();
    await ownerMobile.screenshot({
      path: "/tmp/gevafit-storefront-context/31-whatsapp-owner-mobile-final-v4.png",
      fullPage: false,
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await context.route("https://wa.me/**", (r) =>
      r.fulfill({ status: 200, body: "Navigation intercepted" }),
    );
    const page = await context.newPage();
    await page.goto(base + "/");
    await page
      .getByRole("link", { name: /Ver producto/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click();
    await page.getByRole("link", { name: /^Ver carrito/ }).click();
    await page.route("**/api/public/storefront/orders", (r) => r.abort());
    await page
      .getByRole("button", { name: "Continuar por WhatsApp", exact: true })
      .click();
    await page.getByText(/No se pudo recuperar el pedido/).waitFor();
    assert.equal(await page.locator(".cart-line").count(), 1);
    const key = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gevafit-public-submission-v1"))
          .requestKey,
    );
    await page.locator(".cart-photo").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
    });
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/31-checkout-error-mobile-final-v4.png",
      fullPage: true,
    });
    const other = await context.newPage();
    await other.goto(base + "/cart");
    await other
      .getByRole("button", { name: "Volver a intentar pedido", exact: true })
      .waitFor();
    await page.unroute("**/api/public/storefront/orders");
    await Promise.all([
      page
        .getByRole("button", { name: "Volver a intentar pedido", exact: true })
        .click(),
      other
        .getByRole("button", { name: "Volver a intentar pedido", exact: true })
        .click(),
    ]);
    await page.getByRole("heading", { name: /Pedido GEVA-/ }).waitFor();
    await other.getByRole("heading", { name: /Pedido GEVA-/ }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: /Pedido GEVA-/ }).textContent(),
      await other.getByRole("heading", { name: /Pedido GEVA-/ }).textContent(),
    );
    assert.equal(
      await other.evaluate(
        () =>
          JSON.parse(localStorage.getItem("gevafit-public-submission-v1"))
            .requestKey,
      ),
      key,
    );
  } finally {
    await browser.close();
  }
});
