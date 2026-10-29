import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const apiBase = process.env.TEST_API_URL,
  base = process.env.PUBLIC_STOREFRONT_URL;
async function api(path, body, method = "POST") {
  const r = await fetch(
    apiBase + "/api/" + path,
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
test("visitor adds selected flavor, persists and edits quantities, recovers validation errors", async () => {
  const p = await api("products", {
    name: "Chocolate " + Date.now(),
    selling_price: "1250.25",
  });
  await api(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
  const s = await api("storefront/draft");
  const d = await api(
    "storefront/draft",
    {
      revision: s.revision,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Proteína de chocolate",
          description: "Presentación de 1 kg",
          variantIds: [p.id],
          imageKey: null,
        },
      ],
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(base + "/products/" + p.presentation_id);
    await page
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click({ timeout: 2500 });
    await page.getByRole("link", { name: /Ver carrito/ }).click();
    await page.getByRole("heading", { name: "Tu carrito" }).waitFor();
    await page.getByLabel("Cantidad de Proteína de chocolate").fill("1001");
    await page.getByLabel("Cantidad de Proteína de chocolate").blur();
    await page
      .getByText(/1\.251\.500,25/)
      .first()
      .waitFor();
    await page.reload();
    await page.getByLabel("Cantidad de Proteína de chocolate").waitFor();
    assert.equal(
      await page.getByLabel("Cantidad de Proteína de chocolate").inputValue(),
      "1001",
    );
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/30-cart-desktop.png",
      fullPage: true,
    });
    await page.route("**/api/public/storefront/cart/validate", (route) =>
      route.abort(),
    );
    await page.reload();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.getByLabel("Cantidad de Proteína de chocolate").inputValue(),
      "1001",
    );
    await page.unroute("**/api/public/storefront/cart/validate");
    await page.getByRole("button", { name: "Volver a intentar" }).click();
    await page
      .getByText(/1\.251\.500,25/)
      .first()
      .waitFor();
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(base + "/cart");
    await mobile
      .getByText(/1\.251\.500,25/)
      .first()
      .waitFor();
    await mobile.screenshot({
      path: "/tmp/gevafit-storefront-context/30-cart-mobile-final.png",
      fullPage: true,
    });
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    assert.equal(await mobile.locator("header").count(), 1);
    await mobile.close();
    await api(
      `products/${p.id}/selling-price`,
      { selling_price: "1300.10" },
      "PUT",
    );
    await page.reload();
    await page
      .getByText(/1\.301\.400,1/)
      .first()
      .waitFor();
    await api(`products/${p.id}/stock`, { quantity: 0 }, "PUT");
    await page.reload();
    await page.getByText("Tu carrito está vacío.").waitFor();
    assert.equal(
      await page.getByRole("button", { name: /WhatsApp/ }).count(),
      0,
    );
  } finally {
    await browser.close();
  }
});

test("visitor keeps separate promo combinations and repeats only the chosen composition", async () => {
  const { Client } = await import("pg");
  const url = process.env.TEST_STOREFRONT_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw Error("disposable DB required");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  const group = "Proteína " + Date.now(),
    a = await api("products", {
      name: "Chocolate",
      variant_group: group,
      selling_price: "1500",
    }),
    b = await api("products", {
      name: "Banana",
      variant_group: group,
      selling_price: "1500",
    });
  for (const p of [a, b])
    await api(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
  const {
    rows: [kit],
  } = await pg.query(
    "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,position) VALUES($1,'kit',2700,'final',999) RETURNING id",
    ["Promo " + Date.now()],
  );
  await pg.query(
    "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,$3)",
    [kit.id, a.id, group],
  );
  await pg.end();
  const state = await api("storefront/draft"),
    draft = await api(
      "storefront/draft",
      {
        revision: state.revision,
        entries: [
          {
            kind: "promo",
            promoId: kit.id,
            title: "Doble proteína",
            description: "Dos unidades con sabores a elección.",
            imageKey: null,
            promoComponents: [{ componentId: a.id, variantIds: [a.id, b.id] }],
          },
        ],
      },
      "PUT",
    );
  await api("storefront/publish", { revision: draft.revision });
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(base + "/promos/" + kit.id);
    assert.equal(
      await page
        .getByRole("button", { name: "Agregar al carrito", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Chocolate", exact: true })
      .nth(0)
      .click();
    await page
      .getByRole("button", { name: "Chocolate", exact: true })
      .nth(1)
      .click();
    await page
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click();
    await page.getByText("Agregado · Ver carrito", {exact:true}).waitFor();
    await page
      .getByRole("button", { name: "Banana", exact: true })
      .nth(1)
      .click();
    await page
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click();
    await page.getByRole("link", { name: /^Ver carrito/ }).click();
    await page.getByRole("heading", { name: "Tu carrito" }).waitFor();
    assert.equal(await page.locator(".cart-line").count(), 2);
    await page.getByLabel("Cantidad de Doble proteína").nth(0).fill("5");
    await page.getByLabel("Cantidad de Doble proteína").nth(0).blur();
    await page.getByText(/16\.200/).waitFor();
    await page.reload();
    await page.getByText(/16\.200/).waitFor();
    assert.equal(await page.locator(".cart-line").count(), 2);
    assert.match(
      await page.locator(".cart-line").nth(0).innerText(),
      /2: Chocolate/,
    );
    assert.match(
      await page.locator(".cart-line").nth(1).innerText(),
      /2: Banana/,
    );
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/30-cart-promos-mobile.png",
      fullPage: true,
    });
    const saved = await page.evaluate(() =>
      localStorage.getItem("gevafit-public-cart-v1"),
    );
    assert.ok(!/cost|stock|price|phone|address|customer/i.test(saved));
    const reopened = await context.newPage();
    await reopened.goto(base + "/cart");
    await reopened.getByText(/16\.200/).waitFor();
    assert.equal(await reopened.locator(".cart-line").count(), 2);
    await api(`products/${b.id}/stock`, { quantity: 0 }, "PUT");
    await reopened.reload();
    await reopened
      .getByText(/13\.500/)
      .first()
      .waitFor();
    assert.equal(await reopened.locator(".cart-line").count(), 1);
    assert.match(
      await reopened.locator(".cart-line").innerText(),
      /2: Chocolate/,
    );
    await reopened
      .getByRole("button", { name: "Quitar Doble proteína" })
      .click();
    await reopened.getByText("Tu carrito está vacío.").waitFor();
    assert.equal(await reopened.locator(".cart-summary").count(), 0);
  } finally {
    await browser.close();
  }
});
