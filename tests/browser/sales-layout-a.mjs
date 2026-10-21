import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated real app required");
async function api(path, body) {
  const r = await fetch(
    base + "/api/" + path,
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
test("layout A uses separate navigation, compact date/discount and permits unknown stock with warning", async () => {
  const suffix = Date.now();
  const p = await api("products", {
    name: "Sin stock Layout " + suffix,
    code: "LAY" + suffix,
    selling_price: "20000",
  });
  for (const a of await api("cash/accounts"))
    if (a.currency === "ARS" && a.balance == null)
      await fetch(base + `/api/cash/accounts/${a.id}/opening-balance`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: "0" }),
      });
  const b = await chromium.launch({
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(base + "/sales/new");
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await nav.getByRole("link", { name: "Nueva venta", exact: true }).waitFor();
    const labels = await nav.getByRole("link").allTextContents();
    assert.equal(
      labels.findIndex((x) => x.trim() === "Nueva venta"),
      labels.findIndex((x) => x.trim() === "Dashboard") + 1,
    );
    const s = page.getByRole("combobox", { name: "Buscar productos" });
    await s.fill("LAY" + suffix);
    await page.getByRole("option").first().waitFor();
    await s.press("Enter");
    assert.match(
      await page.locator(".sales-line").innerText(),
      /Stock actual: 0/,
    );
    await page
      .getByRole("button", { name: "Abrir calendario de Fecha de venta" })
      .click();
    const calendar = page.getByRole("dialog", {
      name: "Elegir Fecha de venta",
    });
    await calendar.waitFor();
    await calendar.getByRole("button", { name: "Hoy", exact: true }).click();
    const date = page.getByLabel("Fecha de venta", { exact: true });
    await date.fill("31/02/2026");
    assert.equal(
      await page
        .getByRole("button", { name: "Revisar venta", exact: true })
        .isEnabled(),
      false,
    );
    await date.fill("2026-10-21");
    const discount = page.getByLabel("Descuento de venta (ARS)", {
      exact: true,
    });
    await discount.fill("500");
    const geometry = await page
      .locator(".sales-global-discount")
      .evaluate((el) => {
        const input = el.querySelector("input").getBoundingClientRect();
        return [...el.querySelectorAll("button")].map((b) =>
          Math.abs(b.getBoundingClientRect().top - input.top),
        );
      });
    assert.equal(
      geometry.every((d) => d < 10),
      true,
    );
    await page
      .getByRole("button", { name: "Revisar venta", exact: true })
      .click();
    const review = page.getByRole("dialog", { name: "Revisar venta" });
    await review.waitFor();
    assert.match(await review.innerText(), /stock negativo/);
    assert.equal(
      await review
        .getByRole("button", { name: "Confirmar venta", exact: true })
        .isEnabled(),
      true,
    );
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: /Venta #.*registrada/ })
      .waitFor();
    await nav.getByRole("link", { name: "Ventas", exact: true }).click();
    await page.waitForURL("**/sales");
    assert.equal(
      (await api("products")).find((x) => x.id === p.id).own_stock,
      -1,
    );
    const card = page
      .locator(".sales-history-item")
      .filter({ hasText: "Layout " + suffix });
    await card.waitFor();
    assert.equal((await card.boundingBox()).height < 180, true);
    await page
      .getByRole("searchbox", { name: "Buscar ventas" })
      .fill("no-existe-venta");
    assert.equal(await page.locator(".sales-history-item").count(), 0);
    await page
      .getByRole("searchbox", { name: "Buscar ventas" })
      .fill("Consumidor final");
    await card.waitFor();
    await page.getByRole("button", { name: "Pendientes", exact: true }).click();
    assert.equal(await card.count(), 0);
    await page.getByRole("button", { name: "Cobradas", exact: true }).click();
    await card.waitFor();
    await nav.getByRole("link", { name: "Nueva venta", exact: true }).click();
    await s.waitFor();
    await page.goBack();
    await page.waitForURL("**/sales");
    await page.goForward();
    await s.waitFor();
    for (const width of [390, 760]) {
      await page.setViewportSize({ width, height: 844 });
      await s.fill("LAY" + suffix);
      await page.getByRole("option").first().waitFor();
      await s.press("Enter");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
  } finally {
    await b.close();
  }
});
