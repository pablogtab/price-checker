import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated app required");
test("order confirmation is specific to current preview; shared policy is editable on mobile", async () => {
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await page.goto(base + "/price-lists");
    await page
      .locator(".lists-index button")
      .filter({ hasText: "Pedidos" })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.locator(".list-preview").waitFor();
    const confirm = page.getByRole("checkbox", { name: /Confirmo incluir/ });
    await confirm.waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Copiar texto", exact: true })
        .isDisabled(),
      true,
    );
    await confirm.check();
    await page.waitForFunction(
      () => !document.querySelector(".preview-heading button").disabled,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Copiar texto", exact: true })
        .isEnabled(),
      true,
    );
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route("**/api/price-lists/*/preview", async (route) => {
      await held;
      await route.fulfill({
        status: 500,
        body: "{}",
        contentType: "application/json",
      });
    });
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator(".list-preview").count(),
      0,
      "regeneration immediately removes old accepted text",
    );
    release();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.locator(".list-preview").count(),
      0,
      "failed regeneration cannot reuse acceptance",
    );
    await page.unroute("**/api/price-lists/*/preview");
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.locator(".list-preview").waitFor();
    await confirm.check();
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/orders14-desktop.png",
    });
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector(".list-preview input[type=checkbox]")
          ?.checked === false,
    );
    assert.equal(await confirm.isChecked(), false);
    await page.getByRole("button", { name: "Configurar encargos" }).click();
    await page
      .getByRole("spinbutton", { name: "Entrega estimada (días)" })
      .fill("10");
    assert.equal(await page.locator(".list-preview").count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/orders14-mobile.png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  } finally {
    await browser.close();
  }
});
