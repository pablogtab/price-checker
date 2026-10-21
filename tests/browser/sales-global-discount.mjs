import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw new Error("Use isolated API/DB");
async function api(path, body, method = "POST") {
  const r = await fetch(
    `${base}/api/${path}`,
    body === undefined
      ? {}
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  assert(r.ok, await r.clone().text());
  return r.json();
}
test("global discount ARS and percent appears in review and persisted sale detail", async () => {
  const suffix = randomUUID();
  const product = await api("products", {
    name: `Global Discount ${suffix}`,
    code: suffix,
    selling_price: "100",
  });
  await api(`products/${product.id}/stock`, { quantity: 20 }, "PUT");
  const accounts = await api("cash/accounts");
  const transfer = accounts.find((a) => a.name === "Transferencia");
  if (!transfer)
    await api("cash/accounts", {
      name: "Transferencia",
      currency: "ARS",
      opening_balance: "0",
    });
  else if (transfer.balance == null)
    await api(
      `cash/accounts/${transfer.id}/opening-balance`,
      { amount: "0" },
      "PUT",
    );
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(`${base}/sales`);
    const search = page.getByRole("combobox", { name: "Buscar productos" });
    await search.fill(suffix);
    await search.press("Enter");
    await page
      .getByText("Aplicar descuento a la venta", { exact: true })
      .click();
    await page
      .getByLabel("Descuento de venta (ARS)", { exact: true })
      .fill("10");
    assert.match(await page.locator(".sales-total").innerText(), /90,00/);
    await page
      .getByRole("button", { name: "Porcentaje (%)", exact: true })
      .click();
    await page.getByLabel("Descuento de venta (%)", { exact: true }).fill("25");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Revisar venta" });
    assert.match(await dialog.innerText(), /Subtotal.*100,00/s);
    assert.match(await dialog.innerText(), /Descuento.*25,00/s);
    assert.match(await dialog.innerText(), /Total de venta.*75,00/s);
    if (process.env.E2E_SCREENSHOTS)
      await dialog.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/discount-review.png`,
      });
    await dialog
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /Venta #.*registrada/ })
      .waitFor();
    const saved = (await api("sales")).find((s) =>
      s.items.some((i) => i.product_id === product.id),
    );
    assert.equal(saved.total, "75");
    assert.equal(saved.discount_mode, "percent");
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    const article = page
      .locator(".sales-history-item")
      .filter({ hasText: `Venta #${saved.id} ·` });
    await article.getByText("Ver productos y cobros", { exact: true }).click();
    assert.match(await article.innerText(), /Descuento.*25,00/s);
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/discount-desktop.png`,
        fullPage: false,
      });
  } finally {
    await browser.close();
  }
});
test("mobile ARS discount persists and full discount creates no fake payment", async () => {
  const suffix = randomUUID();
  const p = await api("products", {
    name: `ARS Discount ${suffix}`,
    code: suffix,
    selling_price: "100",
  });
  await api(`products/${p.id}/stock`, { quantity: 20 }, "PUT");
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.goto(`${base}/sales`);
    await page.getByRole("combobox", { name: "Buscar productos" }).fill(suffix);
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .press("Enter");
    await page
      .getByText("Aplicar descuento a la venta", { exact: true })
      .click();
    await page
      .getByLabel("Descuento de venta (ARS)", { exact: true })
      .fill("100");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Revisar venta" });
    assert.match(await dialog.innerText(), /Total de venta.*0,00/s);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/discount-mobile-review.png`,
        fullPage: true,
      });
    await dialog
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /Venta #.*registrada/ })
      .waitFor();
    const saved = (await api("sales")).find((s) =>
      s.items.some((i) => i.product_id === p.id),
    );
    assert.equal(saved.discount_mode, "amount");
    assert.equal(saved.discount_value, "100");
    assert.equal(saved.total, "0");
    assert.deepEqual(saved.payments, []);
  } finally {
    await browser.close();
  }
});
