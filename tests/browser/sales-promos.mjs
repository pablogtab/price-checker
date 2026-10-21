import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw new Error("Isolated E2E_BASE_URL and E2E_ALLOW_FIXTURES=1 required");
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
  assert.equal(r.ok, true, `${path}: ${await r.clone().text()}`);
  return r.json();
}
test("promo picker cancels safely, repeats chosen combinations and consumes exact flavors", async () => {
  const suffix = Date.now(),
    group = `Whey ${suffix}`;
  const choc = await api("products", {
    name: `Chocolate ${suffix}`,
    variant_group: group,
    selling_price: "1100",
  });
  const vanilla = await api("products", {
    name: `Vainilla ${suffix}`,
    variant_group: group,
    selling_price: "1300",
  });
  for (const p of [choc, vanilla])
    await api(`products/${p.id}/stock`, { quantity: 3 }, "PUT");
  const promo = await api("products", {
    name: `Promo x2 ${suffix}`,
    code: `PROMO${suffix}`,
    kind: "kit",
    components: [{ variant_group: group, quantity: 2 }],
    kit_pricing_mode: "discount",
    kit_discount_percent: "10",
    selling_price: "2000",
  });
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
    page.setDefaultTimeout(8000);
    await page.goto(`${base}/sales`);
    const search = page.getByRole("combobox", { name: "Buscar productos" });
    await search.fill(`PROMO${suffix}`);
    await search.press("Enter");
    const picker = page.getByRole("dialog", {
      name: "Elegir sabores de la promo",
      exact: true,
    });
    await picker.waitFor();
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/promo-picker-desktop.png`,
        fullPage: true,
      });
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 0);
    assert.equal(
      await picker
        .getByRole("button", { name: "Agregar promo", exact: true })
        .isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "hidden" });
    assert.equal(
      await search.evaluate((el) => el === document.activeElement),
      true,
    );
    assert.equal(
      (await api("products")).find((p) => p.id === choc.id).own_stock,
      3,
    );
    async function choose(names) {
      await search.fill(`PROMO${suffix}`);
      await search.press("Enter");
      await picker.waitFor();
      for (let i = 0; i < names.length; i++) {
        await picker
          .getByRole("button", { name: new RegExp(`unidad ${i + 1}:`) })
          .click();
        await page
          .getByRole("button", { name: new RegExp("^" + names[i] + " Stock:") })
          .click();
      }
      if (process.env.E2E_SCREENSHOTS && page.viewportSize().width < 500)
        await page.screenshot({
          path: `${process.env.E2E_SCREENSHOTS}/promo-picker-mobile.png`,
          fullPage: true,
        });
      await picker
        .getByRole("button", { name: "Agregar promo", exact: true })
        .click();
      await picker.waitFor({ state: "hidden" });
    }
    await choose([`Chocolate ${suffix}`, `Vainilla ${suffix}`]);
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "2200",
    );
    assert.equal(
      await search.evaluate((el) => el === document.activeElement),
      true,
    );
    await page
      .getByLabel("Precio unitario (ARS)", { exact: true })
      .fill("2100");
    await page
      .getByRole("button", { name: "Repetir combinación", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Cantidad", { exact: true }).inputValue(),
      "2",
    );
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "2100",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await choose([`Chocolate ${suffix}`, `Chocolate ${suffix}`]);
    assert.equal(await page.getByLabel("Cantidad", { exact: true }).count(), 2);
    assert.match(
      await page.locator("app-sales").innerText(),
      /stock negativo/i,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
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
    assert.match(await review.innerText(), /6\.200/);
    assert.match(await review.innerText(), new RegExp(`Vainilla ${suffix}`));
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/promo-review-mobile.png`,
        fullPage: true,
      });
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /registrada/ })
      .waitFor();
    const sales = (await api("sales")).filter((s) =>
      s.items.some((i) => i.product_id === promo.id),
    );
    assert.equal(sales.length, 1);
    assert.equal(Number(sales[0].total), 6200);
    const stock = await api("products");
    assert.equal(stock.find((p) => p.id === choc.id).own_stock, -1);
    assert.equal(stock.find((p) => p.id === vanilla.id).own_stock, 1);
    const parts = sales[0].items.flatMap((i) => i.components);
    assert.equal(
      parts
        .filter((c) => c.product_id === choc.id)
        .reduce((s, c) => s + Number(c.quantity), 0),
      4,
    );
    assert.equal(
      parts
        .filter((c) => c.product_id === vanilla.id)
        .reduce((s, c) => s + Number(c.quantity), 0),
      2,
    );
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await page.getByText(`Venta #${sales[0].id} ·`).waitFor();
    await page
      .getByText("Ver productos y cobros", { exact: true })
      .first()
      .click();
    assert.match(
      await page.locator("app-sales").innerText(),
      new RegExp(`Vainilla ${suffix}`),
    );
  } finally {
    await browser.close();
  }
});

test("fixed-price promo keeps rounded final price, requires explicit flavor and copies it when quantity changes", async () => {
  const suffix = Date.now(),
    group = `Creatina ${suffix}`;
  const flavor = await api("products", {
    name: `Neutra ${suffix}`,
    variant_group: group,
    selling_price: "1700",
  });
  await api(`products/${flavor.id}/stock`, { quantity: 10 }, "PUT");
  const promo = await api("products", {
    name: `Promo final ${suffix}`,
    code: `FINAL${suffix}`,
    kind: "kit",
    components: [{ variant_group: group, quantity: 2 }],
    kit_pricing_mode: "final",
    selling_price: "2450",
  });
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
    page.setDefaultTimeout(8000);
    await page.goto(`${base}/sales`);
    const search = page.getByRole("combobox", { name: "Buscar productos" });
    await search.fill(`FINAL${suffix}`);
    await search.press("Enter");
    const picker = page.getByRole("dialog", {
      name: "Elegir sabores de la promo",
      exact: true,
    });
    await picker.waitFor();
    assert.equal(
      await picker
        .getByRole("button", { name: "Agregar promo", exact: true })
        .isDisabled(),
      true,
    );
    for (let i = 1; i <= 2; i++) {
      await picker
        .getByRole("button", { name: new RegExp(`unidad ${i}:`) })
        .click();
      await page
        .getByRole("button", { name: new RegExp(`^Neutra ${suffix} Stock:`) })
        .click();
    }
    assert.match(await picker.innerText(), /2\.500/);
    await picker
      .getByRole("button", { name: "Agregar promo", exact: true })
      .click();
    await picker.waitFor({ state: "hidden" });
    await page.getByLabel("Cantidad", { exact: true }).fill("3");
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "2500",
    );
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const review = page.getByRole("dialog", {
      name: "Revisar venta",
      exact: true,
    });
    await review.waitFor();
    assert.match(await review.innerText(), /7\.500/);
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /registrada/ })
      .waitFor();
    const sale = (await api("sales")).find((s) =>
      s.items.some((i) => i.product_id === promo.id),
    );
    assert.equal(Number(sale.total), 7500);
    assert.equal(
      (await api("products")).find((p) => p.id === flavor.id).own_stock,
      4,
    );
  } finally {
    await browser.close();
  }
});
