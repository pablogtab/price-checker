import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated E2E_BASE_URL and E2E_ALLOW_FIXTURES required");
async function api(path, body) {
  const r = await fetch(
    `${base}/api/${path}`,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  assert.equal(r.ok, true, await r.clone().text());
  return r.json();
}
test("checkout offers direct account choices and optional partial payment without dropdowns", async () => {
  const suffix = Date.now();
  const p = await api("products", {
    name: `Whey Chocolate UX ${suffix}`,
    code: `UX${suffix}`,
    selling_price: "20000",
  });
  for (const name of ["Transferencia", "Efectivo"])
    if (!(await api("cash/accounts")).some((a) => a.name === name))
      await api("cash/accounts", {
        name,
        currency: "ARS",
        opening_balance: "0",
      });
  for (const a of await api("cash/accounts"))
    if (a.currency === "ARS" && a.balance == null) {
      const r = await fetch(
        `${base}/api/cash/accounts/${a.id}/opening-balance`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount: "0" }),
        },
      );
      assert.equal(r.ok, true);
    }
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
    await search.fill(`UX${suffix}`);
    await search.press("Enter");
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const review = page.getByRole("dialog", { name: "Revisar venta" });
    await review
      .getByRole("button", { name: "Transferencia", exact: true })
      .waitFor();
    assert.equal(
      await review
        .getByRole("button", { name: "Transferencia", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await review.getByRole("combobox").count(), 0);
    await review
      .getByRole("button", { name: "Cuenta corriente", exact: true })
      .click();
    assert.equal(
      await review
        .getByRole("button", { name: "Confirmar venta", exact: true })
        .isEnabled(),
      false,
    );
    assert.match(await review.innerText(), /Elegí un cliente/);
    await review
      .getByRole("button", { name: "Transferencia", exact: true })
      .click();
    await review.getByRole("button", { name: "Efectivo", exact: true }).click();
    assert.equal(
      await review
        .getByRole("button", { name: "Efectivo", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await review.getByLabel("Cobrar ahora (ARS)").isVisible(),
      false,
    );
    await review.getByText("Cobrar una parte", { exact: true }).click();
    await review.getByLabel("Cobrar ahora (ARS)").fill("10000");
    assert.equal(
      await review
        .getByRole("button", { name: "Confirmar venta", exact: true })
        .isEnabled(),
      false,
    );
    assert.match(await review.innerText(), /cliente/i);
    await review
      .getByRole("button", { name: "Cobrar el total", exact: true })
      .click();
    assert.equal(
      await review
        .getByRole("button", { name: "Confirmar venta", exact: true })
        .isEnabled(),
      true,
    );
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/after-review-desktop.png`,
        fullPage: true,
      });
    await review.getByRole("button", { name: "Volver al carrito" }).click();
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/after-cart-desktop.png`,
        fullPage: true,
      });
    for (const width of [760, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/after-cart-mobile.png`,
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/after-review-mobile.png`,
        fullPage: true,
      });
  } finally {
    await browser.close();
  }
});
