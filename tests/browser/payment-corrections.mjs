import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Use disposable E2E_BASE_URL with E2E_ALLOW_FIXTURES");
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
test("desktop and mobile correct a real receipt, cancel preview, and show audit", async () => {
  const suffix = Date.now();
  const c = await api("customers", { name: "Cliente corrección " + suffix });
  const a = await api("cash/accounts", {
    name: "Corrección " + suffix,
    currency: "ARS",
    opening_balance: "0",
  });
  const p = await api("products", {
    name: "Whey " + suffix,
    selling_price: "20000",
  });
  await api(`products/${p.id}/stock`, { quantity: 4 }, "PUT");
  const sale = await api("sales", {
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: p.id, quantity: 1, unit_price: "20000" }],
    payment: { account_id: a.id, amount: "20000" },
    request_key: randomUUID(),
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } });
      await page.goto(base + "/sales");
      await page
        .getByRole("button", { name: "Historial", exact: true })
        .click();
      const row = page
        .locator("article")
        .filter({
          has: page.getByRole("heading", {
            name: `Venta #${sale.id} · Cliente corrección ${suffix}`,
          }),
        });
      await row.locator("summary").click();
      await row
        .getByRole("button", { name: "Corregir cobro", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: `Corregir cobro · Venta #${sale.id}`,
      });
      await dialog
        .getByLabel("Importe del cobro", { exact: true })
        .fill(width === 1440 ? "18000" : "19000");
      await dialog
        .getByRole("button", { name: "Revisar corrección", exact: true })
        .click();
      await dialog.getByText("Revisá los cambios", { exact: true }).waitFor();
      assert.equal(
        (await api("sales")).find((s) => s.id === sale.id).paid,
        width === 1440 ? "20000" : "18000",
      );
      if (process.env.E2E_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.E2E_SCREENSHOTS +
            "/payment-correction-" +
            width +
            ".png",
          fullPage: true,
        });
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await row
        .getByRole("button", { name: "Corregir cobro", exact: true })
        .click();
      await page
        .getByLabel("Importe del cobro", { exact: true })
        .fill(width === 1440 ? "18000" : "19000");
      await page
        .getByRole("button", { name: "Revisar corrección", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirmar corrección", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        (await api("sales")).find((s) => s.id === sale.id).paid,
        width === 1440 ? "18000" : "19000",
      );
      await row
        .getByRole("button", { name: "Ver correcciones", exact: true })
        .click();
      await row
        .getByText(/Corrección de cobro/)
        .first()
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
