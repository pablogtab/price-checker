import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
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
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated app required");
test("owner reviews legacy flavor prices and explicitly resolves the presentation", async () => {
  const { Client } = await import("pg");
  const url = process.env.TEST_GROUP_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw Error("Disposable database required");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  const group = "UI legacy " + Date.now();
  try {
    const {
      rows: [p],
    } = await pg.query(
      "INSERT INTO presentations(variant_group) VALUES($1) RETURNING id",
      [group],
    );
    await pg.query(
      "INSERT INTO products(name,variant_group,selling_price,position,presentation_id) VALUES($1,$3,100,1000,$4),($2,$3,120,1001,$4)",
      ["UI Chocolate " + group, "UI Banana " + group, group, p.id],
    );
  } finally {
    await pg.end();
  }
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/products");
    const panel = page.getByRole("region", {
      name: "Precios pendientes de resolver",
    });
    await panel.waitFor({ timeout: 10000 });
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/23-pending-desktop.png",
      fullPage: true,
    });
    const card = panel
      .locator(".presentation-price-card")
      .filter({ hasText: group });
    await page.setViewportSize({ width: 390, height: 844 });
    await card.screenshot({
      path: "/tmp/gevafit-storefront-context/23-pending-mobile.png",
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await card.getByLabel("Precio común (ARS)").fill("5678.90");
    await card
      .getByRole("button", { name: "Aplicar a todos los sabores" })
      .click();
    await card.waitFor({ state: "hidden" });
    assert.ok(
      !(await page.getByRole("alert").allTextContents()).some((t) =>
        t.includes("error"),
      ),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/23-resolved-mobile.png",
    });
  } finally {
    await browser.close();
  }
});

test("owner creates a flavor in a resolved presentation and edits its common price from the table", async () => {
  const group = "UI resolved " + Date.now();
  const first = await api("products", {
    name: "UI first " + group,
    variant_group: group,
    selling_price: "1500.25",
  });
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/products");
    await page
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Nuevo producto",
      exact: true,
    });
    await dialog.getByLabel("Nombre", { exact: true }).fill("UI new " + group);
    await dialog.getByRole("button", { name: /Presentación:/ }).click();
    await page
      .getByRole("dialog", { name: "Presentación", exact: true })
      .getByRole("button", { name: group, exact: true })
      .click();
    await dialog.locator('input[name="selling"]').fill("1");
    await dialog
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    const created = (await api("products")).find(
      (p) => p.name === "UI new " + group,
    );
    assert.equal(created.selling_price, "1500.25");
    assert.equal(created.presentation_id, first.presentation_id);
    await page.getByRole("textbox", { name: "Buscar productos" }).fill(group);
    await page
      .getByRole("button", {
        name: "Editar precio de venta de UI new " + group,
        exact: true,
      })
      .click();
    await page.locator(".inline-price-form input").fill("2500.75");
    await page
      .locator(".inline-price-form")
      .getByRole("button", { name: "Guardar", exact: true })
      .click();
    await page.locator(".inline-price-form").waitFor({ state: "hidden" });
    const variants = (await api("products")).filter(
      (p) => p.presentation_id === first.presentation_id,
    );
    assert.ok(variants.every((p) => p.selling_price === "2500.75"));
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/23-common-price-desktop.png",
    });
  } finally {
    await browser.close();
  }
});
