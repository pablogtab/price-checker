import {openSaleDetails} from "../helpers/sales-ui.mjs";
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
test("desktop and mobile preview, cancel, confirm annulment and inspect historical state", async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    for (const width of [1440, 390]) {
      const suffix = Date.now();
      const p = await api("products", {
        name: "Anulación navegador " + suffix,
        selling_price: "20000",
      });
      await api(`products/${p.id}/stock`, { quantity: 4 }, "PUT");
      const a = await api("cash/accounts", {
        name: "Anulación navegador " + suffix,
        currency: "ARS",
        opening_balance: "0",
      });
      const s = await api("sales", {
        sold_on: "2026-10-21",
        items: [{ product_id: p.id, quantity: 1, unit_price: "20000" }],
        payment: { amount: "20000", account_id: a.id },
        request_key: randomUUID(),
      });
      const page = await browser.newPage({ viewport: { width, height: 950 } });
      await page.goto(base + "/sales/new");
      await page
        .getByRole("link", { name: "Ventas", exact: true })
        .click();
      const row = page
        .locator("article")
        .filter({
          has: page.getByRole("heading", {
            name: `Venta #${s.id} · Consumidor final`,
          }),
        });
      await openSaleDetails(row);
      await row.getByRole("button", { name: "Anular", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Anular venta #" + s.id,
      });
      await dialog.getByText("Revisá los efectos", { exact: true }).waitFor();
      assert.equal(
        (await api("sales")).find((x) => x.id === s.id).status,
        "active",
      );
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await openSaleDetails(row);
      await row.getByRole("button", { name: "Anular", exact: true }).click();
      await dialog.getByText("Revisá los efectos", { exact: true }).waitFor();
      if (process.env.E2E_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.E2E_SCREENSHOTS + "/annul-preview-" + width + ".png",
          fullPage: true,
        });
      await dialog
        .getByRole("button", { name: "Confirmar anulación", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      await row.getByText("Anulada",{exact:true}).waitFor();
      assert.equal(
        await row.getByRole("button", { name: "Anular", exact: true }).count(),
        0,
      );
      await openSaleDetails(row);
      await row
        .getByRole("button", { name: "Ver correcciones", exact: true })
        .click();
      await row.getByText(/Anulación de venta/).waitFor();
      assert.equal(
        (await api("sales")).find((x) => x.id === s.id).status,
        "annulled",
      );
      assert.equal(
        (await api("cash/accounts")).find((x) => x.id === a.id).balance,
        "0",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      if (process.env.E2E_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.E2E_SCREENSHOTS + "/annul-history-" + width + ".png",
          fullPage: true,
        });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
