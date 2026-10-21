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
async function readyTransfer() {
  let account = (await api("cash/accounts")).find(
    (a) => a.name === "Transferencia" && a.currency === "ARS",
  );
  if (!account)
    account = await api("cash/accounts", {
      name: "Transferencia",
      currency: "ARS",
      opening_balance: "0",
    });
  else if (account.balance == null)
    await api(
      `cash/accounts/${account.id}/opening-balance`,
      { amount: "0" },
      "PUT",
    );
  return (await api("cash/accounts")).find((a) => a.id === account.id);
}
test("draft survives reload and preserves manual prices until explicitly updated", async () => {
  const id = Date.now();
  const product = await api("products", {
    name: `Draft Chocolate ${id}`,
    selling_price: "20000",
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/sales`);
    const search = page.getByRole("combobox", { name: "Buscar productos" });
    await search.fill(`Draft Chocolate ${id}`);
    await search.press("Enter");
    await page
      .getByLabel("Precio unitario (ARS)", { exact: true })
      .fill("18000");
    await api(
      `products/${product.id}`,
      { name: product.name, selling_price: "23000" },
      "PUT",
    );
    await page.reload();
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "18000",
    );
    await page
      .getByRole("button", { name: "Actualizar precios", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "23000",
    );
    await page
      .getByRole("button", { name: "Descartar carrito", exact: true })
      .click();
    await page.reload();
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
  } finally {
    await browser.close();
  }
});

test("uncertain submission survives reload and changed cart without duplicating sale or stock", async () => {
  const transfer = await readyTransfer();
  const id = Date.now();
  const product = await api("products", {
    name: `Retry ${id}`,
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
      viewport: { width: 390, height: 844 },
    });
    await page.goto(`${base}/sales`);
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .fill(`Retry ${id}`);
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    let key;
    await page.route("**/api/sales", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      key = route.request().postDataJSON().request_key;
      await route.fetch();
      await route.abort("failed");
    });
    let review = page.getByRole("dialog", { name: "Revisar venta" });
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.getByRole("alert").waitFor();
    await page.unroute("**/api/sales");
    await page.reload();
    await page.getByLabel("Cantidad", { exact: true }).fill("3");
    await page
      .getByRole("button", { name: "Verificar envío pendiente", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: process.env.E2E_SCREENSHOTS + "/draft-retry-mobile.png",
        fullPage: true,
      });
    await page
      .getByRole("dialog", { name: "Revisar venta" })
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByLabel("Cantidad", { exact: true })
      .waitFor({ state: "hidden" });
    const sales = (await api("sales")).filter((s) =>
      s.items.some((i) => i.product_id === product.id),
    );
    assert.equal(sales.length, 1);
    assert.equal(sales[0].total, "10000");
    assert.equal(sales[0].paid, "10000");
    const after = (await api("cash/accounts")).find(
      (a) => a.id === transfer.id,
    );
    assert.equal(Number(after.balance) - Number(transfer.balance), 10000);
    assert.equal(
      (await api("products")).find((p) => p.id === product.id).own_stock,
      4,
    );
    assert.equal((await api(`sales/requests/${key}`)).id, sales[0].id);
    await page.reload();
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
  } finally {
    await browser.close();
  }
});
test("removed product is explained after restoration and remaining cart can be corrected", async () => {
  const id = Date.now();
  const product = await api("products", {
    name: `Removed ${id}`,
    selling_price: "100",
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/sales`);
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .fill(`Removed ${id}`);
    await page.keyboard.press("Enter");
    await api(`products/${product.id}`, {}, "DELETE");
    await page.reload();
    await page
      .getByRole("alert")
      .filter({ hasText: /ya no disponible/ })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Revisar venta", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Quitar producto vendido" }).click();
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
  } finally {
    await browser.close();
  }
});

test("promo combinations, metadata, discount and partial collection survive closing a tab", async () => {
  await readyTransfer();
  const id = Date.now(),
    group = `Draft group ${id}`;
  const choc = await api("products", {
    name: `Draft Choc ${id}`,
    variant_group: group,
    selling_price: "1000",
  });
  const vanilla = await api("products", {
    name: `Draft Vanilla ${id}`,
    variant_group: group,
    selling_price: "2000",
  });
  for (const p of [choc, vanilla])
    await api(`products/${p.id}/stock`, { quantity: 5 }, "PUT");
  const promo = await api("products", {
    name: `Draft promo ${id}`,
    kind: "kit",
    components: [{ variant_group: group, quantity: 2 }],
    kit_pricing_mode: "discount",
    kit_discount_percent: "10",
    selling_price: "2700",
  });
  const customer = await api("customers", { name: `Draft customer ${id}` });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const context = await browser.newContext();
    let page = await context.newPage();
    await page.goto(`${base}/sales`);
    await page.getByRole("button", { name: /^Cliente:/ }).click();
    await page
      .getByRole("button", { name: new RegExp(`^Draft customer ${id}`) })
      .click();
    await page.getByText("Fecha y nota", { exact: true }).click();
    await page.getByLabel("Fecha de venta", { exact: true }).fill("2026-10-20");
    await page.getByLabel(/^Nota/).fill("Persisted note");
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .fill(`Draft promo ${id}`);
    await page.keyboard.press("Enter");
    const picker = page.getByRole("dialog", {
      name: "Elegir sabores de la promo",
    });
    for (const [i, name] of [
      `Draft Choc ${id}`,
      `Draft Vanilla ${id}`,
    ].entries()) {
      await picker
        .getByRole("button", { name: new RegExp(`unidad ${i + 1}:`) })
        .click();
      await page
        .getByRole("button", { name: new RegExp(`^${name} Stock:`) })
        .click();
    }
    await picker
      .getByRole("button", { name: "Agregar promo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Repetir combinación", exact: true })
      .click();
    await page
      .getByText("Aplicar descuento a la venta", { exact: true })
      .click();
    await page
      .getByLabel("Descuento de venta (ARS)", { exact: true })
      .fill("400");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    await page.getByText("Cobrar una parte", { exact: true }).click();
    await page.getByLabel("Cobrar ahora (ARS)", { exact: true }).fill("1000");
    await page
      .getByRole("button", { name: "Volver al carrito", exact: true })
      .click();
    await page.close();
    page = await context.newPage();
    await page.goto(`${base}/sales`);
    assert.equal(
      await page.getByLabel("Cantidad", { exact: true }).inputValue(),
      "2",
    );
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "2700",
    );
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const review = page.getByRole("dialog", { name: "Revisar venta" });
    assert.equal(
      await review.getByLabel("Cobrar ahora (ARS)").inputValue(),
      "1000",
    );
    assert.match(await review.innerText(), /5.000/);
    assert.match(await review.innerText(), /Draft Choc/);
    assert.match(await review.innerText(), /Draft Vanilla/);
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.waitFor({ state: "hidden" });
    const sale = (await api(`sales?customer_id=${customer.id}`)).find((s) =>
      s.items.some((i) => i.product_id === promo.id),
    );
    assert.equal(sale.customer_id, customer.id);
    assert.equal(sale.sold_on, "2026-10-20");
    assert.equal(sale.note, "Persisted note");
    assert.equal(sale.total, "5000");
    assert.equal(sale.paid, "1000");
    assert.equal(sale.items.length, 2);
  } finally {
    await browser.close();
  }
});
test("unreceived submission retries original payload after a network failure and reload", async () => {
  const transfer = await readyTransfer();
  const id = Date.now();
  const product = await api("products", {
    name: `Retry ${id}`,
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
      viewport: { width: 390, height: 844 },
    });
    await page.goto(`${base}/sales`);
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .fill(`Retry ${id}`);
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    let key;
    await page.route("**/api/sales", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      key = route.request().postDataJSON().request_key;
      await route.abort("failed");
    });
    let review = page.getByRole("dialog", { name: "Revisar venta" });
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.getByRole("alert").waitFor();
    await page.unroute("**/api/sales");
    await page.reload();
    await page.getByLabel("Cantidad", { exact: true }).fill("3");
    await page
      .getByRole("button", { name: "Verificar envío pendiente", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: process.env.E2E_SCREENSHOTS + "/draft-retry-mobile.png",
        fullPage: true,
      });
    await page
      .getByRole("dialog", { name: "Revisar venta" })
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByLabel("Cantidad", { exact: true })
      .waitFor({ state: "hidden" });
    const sales = (await api("sales")).filter((s) =>
      s.items.some((i) => i.product_id === product.id),
    );
    assert.equal(sales.length, 1);
    assert.equal(sales[0].total, "10000");
    assert.equal(sales[0].paid, "10000");
    const after = (await api("cash/accounts")).find(
      (a) => a.id === transfer.id,
    );
    assert.equal(Number(after.balance) - Number(transfer.balance), 10000);
    assert.equal(
      (await api("products")).find((p) => p.id === product.id).own_stock,
      4,
    );
    assert.equal((await api(`sales/requests/${key}`)).id, sales[0].id);
    await page.reload();
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
  } finally {
    await browser.close();
  }
});

test("discard resolves an uncertain attempt and never creates an unreceived sale", async () => {
  const transfer = await readyTransfer(),
    id = Date.now();
  const product = await api("products", {
    name: `Discard uncertain ${id}`,
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
    const page = await browser.newPage();
    await page.goto(`${base}/sales`);
    await page
      .getByRole("combobox", { name: "Buscar productos" })
      .fill(`Discard uncertain ${id}`);
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    await page.route("**/api/sales", (route) =>
      route.request().method() === "POST"
        ? route.abort("failed")
        : route.continue(),
    );
    const review = page.getByRole("dialog", { name: "Revisar venta" });
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.getByRole("alert").waitFor();
    await page.unroute("**/api/sales");
    await review
      .getByRole("button", { name: "Volver al carrito", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Descartar carrito", exact: true })
      .click();
    await page
      .getByLabel("Cantidad", { exact: true })
      .waitFor({ state: "hidden" });
    await page.reload();
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
    assert.equal(
      (await api("sales")).filter((s) =>
        s.items.some((i) => i.product_id === product.id),
      ).length,
      0,
    );
    assert.equal(
      (await api("products")).find((p) => p.id === product.id).own_stock,
      5,
    );
    assert.equal(
      (await api("cash/accounts")).find((a) => a.id === transfer.id).balance,
      transfer.balance,
    );
  } finally {
    await browser.close();
  }
});
