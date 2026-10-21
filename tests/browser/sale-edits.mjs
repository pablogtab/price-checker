import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Disposable fixture API required");
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
  assert.equal(r.ok, true, await r.clone().text());
  return r.json();
}
for (const mobile of [false, true])
  test(`historical sale editor ${mobile ? "mobile" : "desktop"} previews, cancels and saves stock delta`, async () => {
    const tag = Date.now(),
      c = await api("customers", { name: "Browser editor " + tag }),
      p = await api("products", {
        name: "Browser historical " + tag,
        selling_price: "100",
      });
    await api(`products/${p.id}/stock`, { quantity: 10 }, "PUT");
    const s = await api("sales", {
      request_key: randomUUID(),
      customer_id: c.id,
      sold_on: "2026-10-21",
      items: [{ product_id: p.id, quantity: 1 }],
    });
    await api(`products/${p.id}/stock`, { quantity: 30 }, "PUT");
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_EXECUTABLE ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    try {
      const page = await browser.newPage({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1440, height: 1000 },
      });
      await page.goto(base + "/sales");
      await page
        .getByRole("button", { name: "Historial", exact: true })
        .click();
      const row = page
        .locator(".sales-history-item")
        .filter({ hasText: "Venta #" + s.id + " ·" });
      await row
        .getByRole("button", { name: "Editar venta", exact: true })
        .click();
      let dialog = page.getByRole("dialog", {
        name: "Editar venta #" + s.id,
        exact: true,
      });
      await dialog.getByLabel("Cantidad editada").fill("3");
      await dialog
        .getByRole("button", { name: "Revisar cambios", exact: true })
        .click();
      await dialog
        .getByText("stock actual 30 → 28", { exact: false })
        .waitFor();
      assert.equal(
        (await api("products")).find((x) => x.id === p.id).own_stock,
        30,
      );
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await row
        .getByRole("button", { name: "Editar venta", exact: true })
        .click();
      dialog = page.getByRole("dialog", {
        name: "Editar venta #" + s.id,
        exact: true,
      });
      assert.equal(
        await dialog.getByLabel("Cantidad editada").inputValue(),
        "1",
      );
      await dialog.getByLabel("Cantidad editada").fill("3");
      await dialog.getByLabel("Descuento editado").fill("10");
      await dialog
        .getByRole("button", { name: "Revisar cambios", exact: true })
        .click();
      await dialog
        .getByText("stock actual 30 → 28", { exact: false })
        .waitFor();
      if (process.env.E2E_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.E2E_SCREENSHOTS +
            "/sale-edit-" +
            (mobile ? "mobile" : "desktop") +
            ".png",
          fullPage: true,
        });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      await dialog
        .getByRole("button", { name: "Confirmar cambios", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      const updated = (await api("sales")).find((x) => x.id === s.id);
      assert.equal(updated.total, "290");
      assert.equal(updated.items[0].unit_price, "100");
      assert.equal(
        (await api("products")).find((x) => x.id === p.id).own_stock,
        28,
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Historial", exact: true })
        .click();
      await page
        .locator(".sales-history-item")
        .filter({ hasText: "Venta #" + s.id + " ·" })
        .getByText("$ 290,00", { exact: true })
        .waitFor();
    } finally {
      await browser.close();
    }
  });
