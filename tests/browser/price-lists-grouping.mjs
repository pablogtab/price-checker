import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated app required");
test("presentation selection persists explicit variants and newly added flavors stay unchecked", async () => {
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage();
  try {
    await page.goto(base + "/price-lists");
    await page.getByRole("button", { name: "+ Nueva lista" }).click();
    await page
      .getByRole("button", { name: "Marca: Todas las marcas", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Marca", exact: true })
      .getByLabel("Sin marca", { exact: true })
      .check();
    await page
      .getByRole("dialog", { name: "Marca", exact: true })
      .getByRole("button", { name: "Listo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tipo: Productos y promos", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Tipo", exact: true })
      .getByLabel("Promos", { exact: true })
      .check();
    await page
      .getByRole("dialog", { name: "Tipo", exact: true })
      .getByRole("button", { name: "Listo", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Buscar productos" })
      .fill("Whey 2 lb");
    await page.getByText("No se encontraron productos individuales.").waitFor();
    await page
      .getByRole("button", { name: "Limpiar filtros", exact: true })
      .click();

    await page
      .getByText("Título del mensaje")
      .locator("input")
      .fill("Sabores " + Date.now());
    await page
      .getByRole("textbox", { name: "Buscar productos" })
      .fill("Whey 2 lb");
    const group = page
      .locator(".presentation-group")
      .filter({ hasText: "Whey 2 lb" })
      .first();
    await group.locator(".presentation-heading input").check();
    assert.equal(await group.locator(".list-product").count(), 0);
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/collapsed-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/collapsed-mobile.png",
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.setViewportSize({ width: 1440, height: 900 });

    await group.getByRole("button", { name: /Ver sabores/ }).click();
    const count = await group.locator(".list-product input").count();
    assert.ok(count >= 3);
    assert.equal(
      await group.locator(".list-product input:checked").count(),
      count,
    );
    await group.locator(".list-product input").first().uncheck();
    assert.equal(
      await group
        .locator(".presentation-heading input")
        .evaluate((el) => el.indeterminate),
      true,
    );
    await page
      .getByRole("button", { name: "Guardar lista", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Lista guardada" })
      .waitFor();
    const title = await page
      .getByText("Título del mensaje")
      .locator("input")
      .inputValue();
    await page.reload();
    await page
      .locator(".lists-index button")
      .filter({ hasText: title })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Buscar productos" })
      .fill("Whey 2 lb");
    await group.getByRole("button", { name: /Ver sabores/ }).click();
    assert.equal(
      await group.locator(".list-product input:checked").count(),
      count - 1,
    );
    const addedResponse = await page.request.post(base + "/api/products", {
      data: {
        name: "Whey 2 lb · Nuevo " + Date.now(),
        variant_group: "Whey 2 lb",
        selling_price: "1000",
      },
    });
    assert.ok(addedResponse.ok());
    const added = await addedResponse.json();
    await page.reload();
    await page
      .locator(".lists-index button")
      .filter({ hasText: title })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Buscar productos" })
      .fill("Whey 2 lb");
    await group.getByRole("button", { name: /Ver sabores/ }).click();
    assert.equal(
      await group
        .locator(".list-product")
        .filter({ hasText: added.name })
        .locator("input")
        .isChecked(),
      false,
    );
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.locator(".list-preview").waitFor();
    const text = await page
      .getByRole("textbox", { name: "Texto para WhatsApp" })
      .inputValue();
    assert.match(text, /Whey 2 lb —/);
    assert.ok(!text.includes(added.name));
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/list13-desktop.png",
    });
    await page.locator(".list-preview").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/list13-message.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/list13-mobile.png",
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  } finally {
    await browser.close();
  }
});
