// Run against an isolated real API/database; fixtures are created through REST.
// PLAYWRIGHT_MODULE may point to a preinstalled Playwright module; no browser download.
import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw new Error(
    "Set E2E_BASE_URL and E2E_ALLOW_FIXTURES=1 for an isolated test database",
  );
async function api(path, body, method = "POST") {
  const response = await fetch(
    `${base}/api/${path}`,
    body === undefined
      ? {}
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  assert.equal(response.ok, true, `${path}: ${await response.clone().text()}`);
  return response.json();
}
test("keyboard cart, review cancellation and confirmation affect the real app once", async () => {
  const suffix = Date.now();
  const product = await api("products", {
    name: `Whey DOYPACK Chocolate ${suffix}`,
    code: `CHOC${suffix}`,
    barcode: `779${suffix}`,
    selling_price: "20000",
  });
  await api(`products/${product.id}/stock`, { quantity: 1 }, "PUT");
  const accounts = await api("cash/accounts");
  let transfer = accounts.find(
    (a) => a.name === "Transferencia" && a.currency === "ARS",
  );
  if (!transfer)
    transfer = await api("cash/accounts", {
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
  const before = (await api("cash/accounts")).find(
    (a) => a.id === transfer.id,
  ).balance;
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
    await page.goto(`${base}/sales/new`);
    const search = page.getByRole("combobox", { name: "Buscar productos" });
    await search.fill(`CHOC${suffix}`);
    await search.press("ArrowDown");
    await search.press("Enter");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .waitFor();
    await page
      .getByLabel("Precio unitario (ARS)", { exact: true })
      .fill("18000");
    if (process.env.E2E_SCREENSHOTS) await page.screenshot({path:`${process.env.E2E_SCREENSHOTS}/sales-cart-desktop.png`,fullPage:true});
    await search.fill(`779${suffix}`);
    await search.press("Enter");
    assert.equal(
      await page.getByLabel("Cantidad", { exact: true }).inputValue(),
      "2",
    );
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "18000",
    );
    assert.equal(
      await search.evaluate((el) => el === document.activeElement),
      true,
    );
    assert.match(
      await page.locator("app-sales").innerText(),
      /stock negativo/i,
    );
    assert.equal(
      (await api("products")).find((p) => p.id === product.id).own_stock,
      1,
    );
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const review = page.getByRole("dialog", { name: "Revisar venta" });
    await review.waitFor();
    assert.match(await review.innerText(), /36\.000/);
    assert.match(await review.innerText(), /Transferencia/);
    await review.getByRole("button", { name: "Volver al carrito" }).click();
    assert.equal(
      (await api("products")).find((p) => p.id === product.id).own_stock,
      1,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    await review.waitFor();
    if (process.env.E2E_SCREENSHOTS) await page.screenshot({path:`${process.env.E2E_SCREENSHOTS}/sales-review-mobile.png`,fullPage:true});
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /registrada/ })
      .waitFor();
    const sales = (await api("sales")).filter((s) =>
      s.items.some((i) => i.product_id === product.id),
    );
    assert.equal(sales.length, 1);
    assert.equal(Number(sales[0].total), 36000);
    assert.equal(
      (await api("products")).find((p) => p.id === product.id).own_stock,
      -1,
    );
    const after = (await api("cash/accounts")).find(
      (a) => a.id === transfer.id,
    ).balance;
    assert.equal(Number(after) - Number(before), 36000);
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
    await page.getByRole("link", { name: "Ventas", exact: true }).click();
    await page.getByText(`Venta #${sales[0].id} ·`).waitFor();
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/sales-history-mobile.png`,
        fullPage: true,
      });
  } finally {
    await browser.close();
  }
});

test("customer editor preserves cart; partial receipt survives a lost response without duplicates", async () => {
  const suffix = Date.now();
  const product = await api("products", {
    name: `Creatina NEUTRA ${suffix}`,
    selling_price: "10000",
  });
  await api(`products/${product.id}/stock`, { quantity: 5 }, "PUT");
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
    await page.goto(`${base}/sales/new`);
    const search = page.getByRole("combobox", { name: "Buscar productos" });
    await search.fill(`NEUTRA ${suffix}`);
    await search.press("Enter");
    await page
      .getByRole("button", { name: "Nuevo cliente", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Nuevo cliente",
      exact: true,
    });
    await editor
      .getByRole("textbox", { name: "Nombre", exact: true })
      .fill(`Cliente ${suffix}`);
    await editor
      .getByRole("button", { name: "Crear cliente", exact: true })
      .click();
    await editor.waitFor({ state: "hidden" });
    assert.equal(
      await page.getByLabel("Cantidad", { exact: true }).inputValue(),
      "1",
    );
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const review = page.getByRole("dialog", { name: "Revisar venta" });
    await review.getByText("Cobrar una parte", { exact: true }).click();
    await review
      .getByRole("spinbutton", { name: "Cobrar ahora (ARS)" })
      .fill("4000");
    assert.match(await review.innerText(), /6\.000/);
    let didLose = false;
    await page.route("**/api/sales", async (route) => {
      if (route.request().method() !== "POST" || didLose)
        return route.continue();
      didLose = true;
      await route.fetch();
      await route.abort("failed");
    });
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.getByRole("alert").waitFor();
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.waitFor({ state: "hidden" });
    const sales = (await api("sales")).filter((s) =>
      s.items.some((i) => i.product_id === product.id),
    );
    assert.equal(sales.length, 1);
    assert.equal(Number(sales[0].paid), 4000);
    assert.equal(Number(sales[0].pending), 6000);
    assert.equal(
      (await api("products")).find((p) => p.id === product.id).own_stock,
      4,
    );
    const customer = (await api("customers")).find(
      (c) => c.id === sales[0].customer_id,
    );
    assert.equal(Number(customer.balance), 6000);
    assert.match(
      await page.getByRole("button", { name: /^Cliente:/ }).innerText(),
      /Consumidor final/,
    );
    await search.fill("nothing-will-match-this-zzzz");
    await page.getByText("No hay productos para esa búsqueda.").waitFor();
    await search.press("Enter");
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
    await search.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/sales-cart-mobile.png`,
        fullPage: true,
      });
  } finally {
    await browser.close();
  }
});
