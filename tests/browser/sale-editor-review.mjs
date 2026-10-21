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
async function select(page, control, name) {
  await control.getByRole("button").click();
  const panel = page.locator(".select-panel");
  const search = panel.getByRole("textbox");
  if (await search.count()) await search.fill(name);
  await panel.getByRole("button", { name, exact: true }).click();
}
test("new edited discount promo uses selected flavors, rounding and manual override; fixed and historical prices stay unchanged", async () => {
  const tag = Date.now(),
    group = "Review flavors " + tag,
    c = await api("customers", { name: "Review buyer " + tag }),
    a = await api("products", {
      name: "Review chocolate " + tag,
      variant_group: group,
      selling_price: "1000",
    }),
    b = await api("products", {
      name: "Review vainilla " + tag,
      variant_group: group,
      selling_price: "2000",
    });
  const rounded = await api("products", {
    name: "Review frutilla " + tag,
    variant_group: group,
    selling_price: "2050",
  });
  for (const p of [a, b, rounded])
    await api(`products/${p.id}/stock`, { quantity: 100 }, "PUT");
  const kit = await api("products", {
      name: "Review discount x2 " + tag,
      kind: "kit",
      kit_pricing_mode: "discount",
      kit_discount_percent: "10",
      components: [{ variant_group: group, quantity: 2 }],
    }),
    fixed = await api("products", {
      name: "Review fixed x2 " + tag,
      kind: "kit",
      kit_pricing_mode: "final",
      selling_price: "7777",
      components: [{ variant_group: group, quantity: 2 }],
    });
  const s = await api("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [{ product_id: a.id, quantity: 1, unit_price: "900" }],
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/sales");
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await page
      .locator(".sales-history-item")
      .filter({ hasText: "Venta #" + s.id + " ·" })
      .getByRole("button", { name: "Editar venta", exact: true })
      .click();
    const editor = page.locator("app-sale-editor");
    await select(
      page,
      editor.locator('app-select[label="Agregar producto a la venta"]'),
      kit.name,
    );
    const line = editor.locator(".line").nth(1);
    for (const control of await line.locator(".components app-select").all())
      await select(page, control, b.name);
    assert.equal(
      await line.getByLabel("Precio editado", { exact: true }).inputValue(),
      "3600",
    );
    for (const control of await line.locator(".components app-select").all())
      await select(page, control, rounded.name);
    assert.equal(
      await line.getByLabel("Precio editado", { exact: true }).inputValue(),
      "3700",
    );
    await line.getByLabel("Precio editado", { exact: true }).fill("3333");
    await select(page, line.locator(".components app-select").nth(1), a.name);
    assert.equal(
      await line.getByLabel("Precio editado", { exact: true }).inputValue(),
      "3333",
    );
    await select(
      page,
      editor.locator('app-select[label="Agregar producto a la venta"]'),
      fixed.name,
    );
    const fixedLine = editor.locator(".line").nth(2);
    for (const control of await fixedLine
      .locator(".components app-select")
      .all())
      await select(page, control, b.name);
    assert.equal(
      await fixedLine
        .getByLabel("Precio editado", { exact: true })
        .inputValue(),
      "7800",
    );
    await editor
      .getByRole("button", { name: "Revisar cambios", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Confirmar cambios", exact: true })
      .click();
    await editor.waitFor({ state: "detached" });
    const after = (await api("sales")).find((x) => x.id === s.id);
    assert.equal(after.items[0].unit_price, "900");
    assert.equal(after.items[1].unit_price, "3333");
    assert.equal(after.items[2].unit_price, "7800");
  } finally {
    await browser.close();
  }
});
test("populated mobile editor keeps large monetary fields, dates and promo flavor selectors usable before review", async () => {
  const tag = Date.now(),
    group = "Mobile review " + tag,
    c = await api("customers", {
      name: "María Fernández - cliente con nombre largo " + tag,
    }),
    a = await api("products", {
      name: "Proteína Premium DOYPACK chocolate presentación grande " + tag,
      variant_group: group,
      selling_price: "1234567.89",
    }),
    b = await api("products", {
      name: "Proteína Premium DOYPACK vainilla presentación grande " + tag,
      variant_group: group,
      selling_price: "2345678.90",
    });
  for (const p of [a, b])
    await api(`products/${p.id}/stock`, { quantity: 10 }, "PUT");
  const kit = await api("products", {
    name:
      "Promo Proteína Premium DOYPACK dos unidades con sabores a elección " +
      tag,
    kind: "kit",
    kit_pricing_mode: "final",
    selling_price: "3456789",
    components: [{ variant_group: group, quantity: 2 }],
  });
  const s = await api("sales", {
    request_key: randomUUID(),
    customer_id: c.id,
    sold_on: "2026-10-21",
    items: [
      {
        product_id: kit.id,
        quantity: 1,
        selections: [
          { component_product_id: a.id, product_id: a.id, quantity: 2 },
        ],
      },
    ],
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.goto(base + "/sales");
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await page
      .locator(".sales-history-item")
      .filter({ hasText: "Venta #" + s.id + " ·" })
      .getByRole("button", { name: "Editar venta", exact: true })
      .click();
    const editor = page.locator("app-sale-editor");
    await editor
      .getByLabel("Precio editado", { exact: true })
      .fill("3456789.12");
    for (const label of [
      "Fecha de venta",
      "Precio editado",
      "Cantidad editada",
    ]) {
      const input = editor.getByLabel(label, { exact: true });
      const box = await input.boundingBox();
      assert.ok(box.width >= 240, `${label} is only ${box.width}px wide`);
      await input.scrollIntoViewIfNeeded();
      if (process.env.E2E_SCREENSHOTS)
        await page.screenshot({
          path:
            process.env.E2E_SCREENSHOTS +
            "/review-mobile-" +
            label.replaceAll(" ", "-") +
            ".png",
        });
    }
    const controls = editor.locator(".components app-select");
    for (const control of await controls.all()) {
      const box = await control.boundingBox();
      assert.ok(box.width >= 240);
    }
    await select(page, controls.nth(1), b.name);
    await controls.nth(1).scrollIntoViewIfNeeded();
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: process.env.E2E_SCREENSHOTS + "/review-mobile-promo-flavors.png",
      });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await editor
      .getByRole("button", { name: "Revisar cambios", exact: true })
      .click();
    await editor
      .getByText("Unidades consumidas: 2 → 1", { exact: false })
      .waitFor();
    await editor
      .getByText("Unidades consumidas: 0 → 1", { exact: false })
      .waitFor();
  } finally {
    await browser.close();
  }
});
