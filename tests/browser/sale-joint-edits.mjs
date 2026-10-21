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
  test(`joint paid editor ${mobile ? "mobile" : "desktop"} reviews, cancels and changes sale and receipt together`, async () => {
    const tag = randomUUID(),
      c = await api("customers", { name: "Joint browser " + tag }),
      a = await api("cash/accounts", {
        name: "Joint browser cash " + tag,
        currency: "ARS",
        opening_balance: "0",
      }),
      p = await api("products", {
        name: "Proteína chocolate " + tag,
        selling_price: "20000",
      });
    await api(`products/${p.id}/stock`, { quantity: 10 }, "PUT");
    const s = await api("sales", {
      request_key: randomUUID(),
      customer_id: c.id,
      sold_on: "2026-10-21",
      items: [{ product_id: p.id, quantity: 1 }],
      payment: { account_id: a.id, amount: "20000", occurred_on: "2026-10-21" },
    });
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
          : { width: 1440, height: 1100 },
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
      await dialog.getByLabel("Precio editado", { exact: true }).fill("18000");
      await dialog
        .getByLabel("Importe del cobro 1", { exact: true })
        .fill("18000");
      await dialog
        .getByRole("button", { name: "Revisar cambios", exact: true })
        .click();
      await dialog.getByText("Cobrado:", { exact: false }).waitFor();
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      assert.equal(
        (await api("sales")).find((x) => x.id === s.id).total,
        "20000",
      );
      await row
        .getByRole("button", { name: "Editar venta", exact: true })
        .click();
      dialog = page.getByRole("dialog", {
        name: "Editar venta #" + s.id,
        exact: true,
      });
      await dialog.getByLabel("Precio editado", { exact: true }).fill("18000");
      await dialog
        .getByLabel("Importe del cobro 1", { exact: true })
        .fill("18000");
      if (process.env.E2E_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.E2E_SCREENSHOTS +
            `/joint-editor-${mobile ? "mobile" : "desktop"}.png`,
          fullPage: false,
        });
      await dialog
        .getByRole("button", { name: "Revisar cambios", exact: true })
        .click();
      await dialog.getByText("Cobrado:", { exact: false }).waitFor();
      await dialog
        .getByRole("button", { name: "Confirmar cambios", exact: true })
        .scrollIntoViewIfNeeded();
      if (process.env.E2E_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.E2E_SCREENSHOTS +
            `/joint-review-${mobile ? "mobile" : "desktop"}.png`,
          fullPage: false,
        });
      await dialog
        .getByRole("button", { name: "Confirmar cambios", exact: true })
        .click();
      await dialog.waitFor({ state: "detached" });
      await page.reload();
      const after = (await api("sales")).find((x) => x.id === s.id);
      assert.equal(after.total, "18000");
      assert.equal(after.paid, "18000");
      assert.equal(
        (await api("cash/accounts")).find((x) => x.id === a.id).balance,
        "18000",
      );
      assert.equal(
        (await api("products")).find((x) => x.id === p.id).own_stock,
        9,
      );
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
