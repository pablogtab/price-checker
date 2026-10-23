import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated app required");
test("lists persist selections and copy exact preview with manual fallback on mobile", async () => {
  const suffix = Date.now();
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  try {
    await page.goto(base + "/price-lists");
    await page.getByRole("button", { name: "+ Nueva lista" }).click();
    await page
      .getByText("Título del mensaje")
      .locator("input")
      .fill("Lista navegador " + suffix);
    await page
      .getByRole("textbox", { name: "Buscar productos" })
      .fill("Whey Chocolate");
    await page.locator(".list-product").first().click();
    await page
      .getByRole("button", { name: "Guardar lista", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Lista guardada" })
      .waitFor();
    await page.reload();
    await page
      .locator(".lists-index button")
      .filter({ hasText: "Lista navegador " + suffix })
      .first()
      .click();
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/debug.png",
      fullPage: false,
    });
    await page.locator(".list-product input:checked").first().waitFor();
    assert.equal(await page.locator(".list-product input:checked").count(), 1);
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.locator(".list-preview").waitFor();
    const text = await page
      .getByRole("textbox", { name: "Texto para WhatsApp" })
      .inputValue();
    assert.doesNotMatch(text, /^Disponible(?=:|$)/m);
    await page.getByRole("button", { name: "Copiar texto" }).click();
    await page.getByText("Texto copiado", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      text,
    );
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/list12-desktop.png",
      fullPage: false,
    });
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(Error("denied"));
    });
    await page.getByRole("button", { name: "Copiar texto" }).click();
    await page.getByText(/copialo manualmente/).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".list-preview").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/list12-mobile.png",
      fullPage: false,
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
