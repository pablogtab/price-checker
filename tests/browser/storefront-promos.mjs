import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "pg";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const privateBase = process.env.E2E_BASE_URL,
  publicBase = process.env.PUBLIC_STOREFRONT_URL,
  url = process.env.TEST_STOREFRONT_DATABASE_URL;
if (
  !privateBase ||
  !publicBase ||
  !url ||
  !new URL(url).pathname.endsWith("_test")
)
  throw Error("isolated origins required");
async function api(path, body, method = "POST") {
  const r = await fetch(
    privateBase + "/api/" + path,
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
test("owner explicitly publishes promo flavors and visitors repeat the same eligible flavor on desktop/mobile", async () => {
  const pg = new Client({ connectionString: url });
  await pg.connect();
  // Other regression fixtures can enqueue refreshes; no worker runs in this isolated database.
  await pg.query(
    "UPDATE refresh_runs SET status='failed',finished_at=now() WHERE status IN ('queued','running')",
  );
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const stamp = Date.now(),
      group = "Proteína " + stamp;
    const a = await api("products", {
        name: "Chocolate",
        variant_group: group,
        selling_price: "1500",
      }),
      b = await api("products", {
        name: "Banana",
        variant_group: group,
        selling_price: "1500",
      }),
      hidden = await api("products", {
        name: "Interno",
        variant_group: group,
        selling_price: "1500",
      });
    for (const p of [a, b, hidden])
      await api(`products/${p.id}/stock`, { quantity: 1 }, "PUT");
    const {
      rows: [kit],
    } = await pg.query(
      "INSERT INTO products(name,kind,selling_price,kit_pricing_mode,kit_discount_percent,position) VALUES($1,'kit',2700,'discount',10,999) RETURNING id",
      ["Promo dos proteínas " + stamp],
    );
    await pg.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,2,$3)",
      [kit.id, a.id, group],
    );
    const state = await api("storefront/draft");
    await api(
      "storefront/draft",
      { revision: state.revision, entries: [] },
      "PUT",
    );
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    await page.goto(privateBase + "/store");
    await page
      .getByRole("button", { name: /Seleccionar presentación/ })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: "Promo dos proteínas " + stamp,
        exact: true,
      })
      .click();
    await page.getByLabel("Título comercial").fill("Promo dos proteínas");
    await page.getByLabel("Chocolate", { exact: true }).check();
    await page.getByLabel("Banana", { exact: true }).check();
    await page.getByLabel("Permitir ofrecer la promo sin stock propio").check();
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await page.getByText("Borrador guardado.", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await page.getByText("Cambios publicados.", { exact: true }).waitFor();
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-editor-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-editor-mobile.png",
    });
    await page
      .getByLabel("Chocolate", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-editor-choices-mobile.png",
    });
    const visitor = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const calls = [];
    visitor.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/"))
        calls.push(new URL(r.url()).pathname);
    });
    await visitor.goto(publicBase);
    const promoCard = visitor
      .locator(".card")
      .filter({ hasText: "Promo dos proteínas" });
    await promoCard.waitFor();
    assert.match(await promoCard.innerText(), /Elegí los sabores por unidad/);
    await promoCard.click();
    await visitor
      .getByRole("heading", { name: "Promo dos proteínas", exact: true })
      .waitFor();
    const units = visitor.getByRole("group");
    assert.equal(await units.count(), 2);
    for (const unit of await units.all()) {
      await unit
        .getByRole("button", { name: "Chocolate", exact: true })
        .click();
      assert.equal(
        await unit
          .getByRole("button", { name: "Chocolate", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
    }
    assert.equal(
      await visitor
        .getByRole("button", { name: "Interno", exact: true })
        .count(),
      0,
    );
    assert.ok(
      !/encargo|stock|capacidad/i.test(
        await visitor.locator("body").innerText(),
      ),
    );
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-promo-desktop.png",
      fullPage: true,
    });
    await visitor.setViewportSize({ width: 390, height: 844 });
    await visitor.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(await visitor.locator("geva-storefront").count(), 1);
    assert.equal(
      await visitor.locator("geva-storefront-view > header").count(),
      1,
    );
    assert.equal(await visitor.getByRole("group").count(), 2);
    assert.equal(
      await visitor.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-promo-mobile-viewport-v2.png",
    });
    await visitor.getByRole("group").last().scrollIntoViewIfNeeded();
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-promo-mobile-choices-v2.png",
    });
    assert.ok(calls.every((p) => p.startsWith("/api/public/storefront/")));
    await visitor.reload();
    await visitor
      .getByRole("heading", { name: "Promo dos proteínas", exact: true })
      .waitFor();
  } finally {
    await pg.end();
    await browser.close();
  }
});
test("management exposes shared permission and stale/failed catalog warnings while the public product omits them", async () => {
  const pg = new Client({ connectionString: url });
  await pg.connect();
  // Other regression fixtures can enqueue refreshes; no worker runs in this isolated database.
  await pg.query(
    "UPDATE refresh_runs SET status='failed',finished_at=now() WHERE status IN ('queued','running')",
  );
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const p = await api("products", {
      name: "Creatina sin sabor " + Date.now(),
      selling_price: "15000",
    });
    const {
      rows: [provider],
    } = await pg.query(
      "INSERT INTO providers(name,last_success_at) VALUES($1,now()-interval '7 days') RETURNING id",
      ["Private provider " + Date.now()],
    );
    const {
      rows: [offer],
    } = await pg.query(
      "INSERT INTO supplier_items(provider_id,external_id,name,brand,category,currency,price,source_price,stock,is_pack,has_variants,seen_at) VALUES($1,'one','Offer','Brand','Other','ARS',10,10,1,false,false,now()) RETURNING id",
      [provider.id],
    );
    await pg.query(
      "INSERT INTO product_links(product_id,provider_id,individual_item_id) VALUES($1,$2,$3)",
      [p.id, provider.id, offer.id],
    );
    await pg.query(
      "INSERT INTO refresh_runs(provider_id,status,trigger,finished_at) VALUES($1,'failed','manual',now())",
      [provider.id],
    );
    const state = await api("storefront/draft");
    await api(
      "storefront/draft",
      { revision: state.revision, entries: [] },
      "PUT",
    );
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(privateBase + "/store");
    await page
      .getByRole("button", { name: /Seleccionar presentación/ })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: p.name, exact: true })
      .click();
    await page.getByLabel("Título comercial").fill("Creatina · 300 g");
    await page.getByLabel(p.name, { exact: true }).check();
    await page
      .getByLabel("Permitir ofrecer sin stock propio: " + p.name, {
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await page.getByText("Borrador guardado.", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.getByText(/el catálogo del proveedor es antiguo/).waitFor();
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-private-warning-desktop-v2.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await page.getByText("Cambios publicados.", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel(p.name, { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-permission-mobile-v2.png",
    });
    const visitor = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await visitor.goto(publicBase + "/products/" + p.presentation_id);
    await visitor.getByRole("heading", { name: "Creatina · 300 g" }).waitFor();
    assert.ok(
      !/encargo|stock|catálogo.*proveedor|falló|private provider/i.test(
        await visitor.locator("body").innerText(),
      ),
    );
    assert.equal(
      (await api("price-list-order-policy")).products.find((x) => x.id === p.id)
        .allowed,
      true,
    );
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/29-union-supplier-product-mobile.png",
      fullPage: true,
    });
    await pg.query("UPDATE supplier_items SET stock=NULL WHERE id=$1", [
      offer.id,
    ]);
    await visitor.reload();
    await visitor.getByText("Este producto ya no está disponible.").waitFor();
  } finally {
    await pg.end();
    await browser.close();
  }
});
