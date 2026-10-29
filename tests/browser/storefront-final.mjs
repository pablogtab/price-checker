import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const apiBase = process.env.TEST_API_URL,
  owner = process.env.E2E_BASE_URL,
  pub = process.env.PUBLIC_STOREFRONT_URL;
const photos = process.env.STOREFRONT_FINAL_PHOTOS;
if (
  !photos ||
  !process.env.E2E_ALLOW_FIXTURES ||
  ![apiBase, owner, pub].every((x) => x && new URL(x).hostname === "127.0.0.1")
)
  throw Error(
    "Explicit local isolated fixture origins and photo directory required",
  );
const out =
  process.env.STOREFRONT_FINAL_EVIDENCE || "/tmp/gevafit-storefront-context";
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
async function capture(page, name, fullPage = true) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img:visible").evaluateAll(async (imgs) => {
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    name + " overflow",
  );
  await page.screenshot({
    path: out + "/33-final-" + name + "-v2.png",
    fullPage,
  });
}
async function choose(page, label, name) {
  await page.getByRole("button", { name: new RegExp(label) }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}
async function media(page, name) {
  await page.getByLabel("Buscar imágenes", { exact: true }).fill(name);
  await page
    .getByRole("region", { name: "Biblioteca de imágenes" })
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Usar esta imagen", exact: true })
    .click();
}
async function state() {
  return {
    sales: await api("sales"),
    accounts: await api("cash/accounts"),
    products: (await api("products"))
      .filter((p) => p.kind === "product")
      .map((p) => [p.id, p.own_stock]),
    customer: await api("customers/" + fixture.customer.id),
  };
}
let fixture;
test("real owner content and media journey through public cart, recoverable WhatsApp request, private inbox and exact existing sale effects", async () => {
  const a = await api("products", {
    name: "Chocolate suizo",
    variant_group: "Star Nutrition Whey Protein · 908 g",
    selling_price: "28900",
  });
  const b = await api("products", {
    name: "Banana",
    variant_group: "Star Nutrition Whey Protein · 908 g",
    selling_price: "28900",
  });
  const hidden = await api("products", {
    name: "Nuevo sabor en revisión",
    variant_group: "Star Nutrition Whey Protein · 908 g",
    selling_price: "28900",
  });
  const c = await api("products", {
    name: "Creatina monohidrato · 300 g",
    selling_price: "18500",
  });
  for (const p of [a, b, hidden, c])
    await api(`products/${p.id}/stock`, { quantity: 20 }, "PUT");
  const kit = await api("products", {
    name: "Dúo Whey Protein · 2 × 908 g",
    kind: "kit",
    kit_pricing_mode: "final",
    selling_price: "54900",
    components: [
      {
        product_id: a.id,
        quantity: 2,
        variant_group: "Star Nutrition Whey Protein · 908 g",
      },
    ],
  });
  const accounts = await api("cash/accounts");
  for (const name of ["Efectivo", "Transferencia"]) {
    let acc = accounts.find((x) => x.name === name && x.currency === "ARS");
    if (!acc)
      acc = await api("cash/accounts", {
        name,
        currency: "ARS",
        opening_balance: "0",
      });
    if (acc.balance == null)
      await api(
        `cash/accounts/${acc.id}/opening-balance`,
        { amount: "0" },
        "PUT",
      );
  }
  const customer = await api("customers", {
    name: "Cliente de prueba · recorrido tienda",
  });
  fixture = { a, b, c, hidden, kit, customer };
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const p = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    p.setDefaultTimeout(10000);
    await p.goto(owner + "/media");
    await p.getByLabel("Subir imágenes").waitFor();
    // Real upload transport failure and retry preserve the selected file.
    let failUpload = true;
    await p.route("**/api/media", (r) =>
      r.request().method() === "POST" && failUpload
        ? ((failUpload = false), r.abort())
        : r.continue(),
    );
    await p
      .getByLabel("Subir imágenes")
      .setInputFiles(photos + "/whey-chocolate-908g.png");
    await p.getByText("No se pudo subir", { exact: true }).waitFor();
    await capture(p, "media-error-desktop");
    await p.getByRole("button", { name: "Reintentar", exact: true }).click();
    await p.getByText("Guardada", { exact: true }).waitFor();
    await p
      .getByLabel("Subir imágenes")
      .setInputFiles([
        photos + "/whey-banana-908g.jpg",
        photos + "/creatina-300g.jpg",
      ]);
    await p.getByText("Guardada", { exact: true }).nth(2).waitFor();
    await p.goto(owner + "/store");
    await p.getByLabel("Número de WhatsApp").fill("12025550123");
    await p
      .getByRole("button", { name: "Guardar WhatsApp", exact: true })
      .click();
    for (const [label, name, action] of [
      ["Nueva categoría", "Proteínas", "Crear categoría"],
      ["Nueva categoría", "Creatina", "Crear categoría"],
      ["Nueva marca", "Star Nutrition", "Crear marca"],
    ]) {
      await p.getByLabel(label, { exact: true }).fill(name);
      await p.getByRole("button", { name: action, exact: true }).click();
    }
    await choose(
      p,
      "Seleccionar presentación",
      "Star Nutrition Whey Protein · 908 g",
    );
    await p.getByLabel("Título comercial").fill("Whey Protein · 908 g");
    await p
      .getByLabel("Descripción comercial")
      .fill(
        "Proteína de suero microfiltrada en polvo. Envase de 908 g. Elegí Chocolate suizo o Banana para tu pedido.",
      );
    for (const name of ["Chocolate suizo", "Banana"])
      await p.getByLabel(name, { exact: true }).check();
    await p.getByLabel("Categoría Proteínas", { exact: true }).check();
    await choose(p, "Marca comercial", "Star Nutrition");
    await p
      .getByRole("button", { name: "Agregar desde biblioteca", exact: true })
      .click();
    await media(p, "whey-chocolate-908g.png");
    await p
      .getByRole("button", { name: "Agregar desde biblioteca", exact: true })
      .click();
    await media(p, "whey-banana-908g.jpg");
    await p
      .getByRole("button", { name: "Mover foto 2 arriba", exact: true })
      .focus();
    await p.keyboard.press("Enter");
    await p
      .getByRole("button", { name: "Elegir foto 2 como portada", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Imagen para Banana", exact: true })
      .click();
    await media(p, "whey-banana-908g.jpg");
    await choose(p, "Seleccionar presentación", "Creatina monohidrato · 300 g");
    await p.getByLabel("Título comercial").fill("Creatina monohidrato · 300 g");
    await p
      .getByLabel("Descripción comercial")
      .fill(
        "Creatina monohidrato ultramicronizada Star Nutrition. Presentación de 300 g, sin sabor.",
      );
    await p.getByLabel("Creatina monohidrato · 300 g", { exact: true }).check();
    await p.getByLabel("Categoría Creatina", { exact: true }).check();
    await choose(p, "Marca comercial", "Star Nutrition");
    await p
      .getByRole("button", { name: "Agregar desde biblioteca", exact: true })
      .click();
    await media(p, "creatina-300g.jpg");
    await choose(p, "Seleccionar presentación", "Dúo Whey Protein · 2 × 908 g");
    await p.getByLabel("Título comercial").fill("Dúo Whey Protein · 2 × 908 g");
    await p
      .getByLabel("Descripción comercial")
      .fill("Dos envases de 908 g. Combiná los sabores de cada unidad.");
    for (const name of ["Chocolate suizo", "Banana"])
      await p.getByLabel(name, { exact: true }).check();
    await p.getByLabel("Categoría Proteínas", { exact: true }).check();
    await choose(p, "Marca comercial", "Star Nutrition");
    await p
      .getByRole("button", { name: "Agregar desde biblioteca", exact: true })
      .click();
    await media(p, "whey-chocolate-908g.png");
    for (const title of [
      "Whey Protein · 908 g",
      "Creatina monohidrato · 300 g",
    ])
      await choose(p, "Agregar destacado:", title);
    await p
      .getByRole("button", { name: "Agregar banner", exact: true })
      .click();
    await p
      .getByLabel("Título del banner", { exact: true })
      .fill("Proteínas Star Nutrition");
    await p
      .getByRole("button", { name: "Elegir imagen del banner", exact: true })
      .click();
    await media(p, "whey-chocolate-908g.png");
    await p
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await p.getByText("Borrador guardado.", { exact: true }).waitFor();
    const d = await api("storefront/draft");
    assert.equal(d.entries.length, 3);
    assert.deepEqual(
      d.entries.find((e) => e.presentationId === a.presentation_id).variantIds,
      [a.id, b.id],
    );
    assert.equal((await api("public/storefront/catalog")).items.length, 0);
    await p.getByRole("button", { name: "Vista previa", exact: true }).click();
    await p
      .getByRole("region", { name: "Vista previa del borrador" })
      .locator(".card")
      .first()
      .waitFor();
    await capture(p, "owner-preview-desktop");
    await p
      .getByRole("button", { name: "Cerrar vista previa", exact: true })
      .click();
    // Invalid price rejects publication without losing authored content or replacing the previous revision.
    await api(
      `presentations/${c.presentation_id}/price`,
      { catalog_price: "0" },
      "PUT",
    );
    await p
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await p.getByRole("alert").waitFor();
    assert.equal((await api("storefront/draft")).revision, d.revision);
    await capture(p, "publication-error-desktop");
    await api(
      `presentations/${c.presentation_id}/price`,
      { catalog_price: "18500" },
      "PUT",
    );
    await p
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await p.getByText("Cambios publicados.", { exact: true }).waitFor();
    const before = await state();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.route("https://wa.me/**", (r) =>
      r.fulfill({
        status: 200,
        body: "Reserved destination intercepted. No message sent.",
      }),
    );
    const v = await context.newPage();
    v.setDefaultTimeout(10000);
    const calls = [];
    v.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/"))
        calls.push(new URL(r.url()).pathname);
    });
    await v.goto(pub);
    await v.locator(".card").first().waitFor();
    assert.equal(await v.locator(".card").count(), 3);
    assert.doesNotMatch(
      await v
        .locator(".card")
        .filter({ hasText: "Creatina monohidrato" })
        .innerText(),
      /1 opción/,
    );
    await capture(v, "home-desktop");
    await v.getByRole("button", { name: "Proteínas", exact: true }).click();
    await v.getByLabel("Buscar productos", { exact: true }).fill("banana");
    await v.getByLabel("Buscar productos", { exact: true }).press("Enter");
    await v.waitForURL((u) => u.searchParams.get("q") === "banana");
    await v
      .locator(".card")
      .filter({ hasText: "Whey Protein · 908 g" })
      .first()
      .waitFor();
    await choose(v, "Marca:", "Star Nutrition");
    await choose(v, "Orden:", "Menor precio");
    const filtered = v.url();
    await v
      .locator(".card")
      .filter({ hasText: "Whey Protein · 908 g" })
      .first()
      .click();
    await v.getByRole("button", { name: "Banana", exact: true }).click();
    await capture(v, "detail-desktop");
    assert.equal(
      await v
        .getByRole("button", { name: "Nuevo sabor en revisión", exact: true })
        .count(),
      0,
    );
    await v.goBack();
    for (const key of ["q", "category", "brand", "order"]) {
      assert.equal(
        new URL(v.url()).searchParams.get(key),
        new URL(filtered).searchParams.get(key),
      );
    }
    await v.goForward();
    await v.getByRole("button", { name: "Banana", exact: true }).click();
    await v
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click();
    await v.goto(pub + "/promos/" + kit.id);
    const units = v.getByRole("group");
    await units
      .nth(0)
      .getByRole("button", { name: "Chocolate suizo", exact: true })
      .click();
    await units
      .nth(1)
      .getByRole("button", { name: "Banana", exact: true })
      .click();
    await v
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click();
    await v.getByText("Agregado · Ver carrito", { exact: true }).waitFor();
    await v.getByRole("link", { name: /^Ver carrito/ }).click();
    await v.getByRole("heading", { name: "Tu carrito", exact: true }).waitFor();
    await v.getByText(/83.800/).waitFor();
    await capture(v, "cart-desktop");
    await v.reload();
    await v.getByText(/83.800/).waitFor();
    assert.deepEqual(await state(), before);
    // Simulate a lost committed response only at the browser/network boundary.
    let key;
    await v.route("**/api/public/storefront/orders", async (r) => {
      key = r.request().postDataJSON().requestKey;
      await r.fetch();
      await r.abort();
    });
    await v
      .getByRole("button", { name: "Continuar por WhatsApp", exact: true })
      .click();
    await v.getByText(/No se pudo recuperar el pedido/).waitFor();
    await capture(v, "checkout-error-desktop");
    await v.unroute("**/api/public/storefront/orders");
    await v.reload();
    await v.getByRole("heading", { name: "Tu pedido", exact: true }).waitFor();
    const saved = await api("public/storefront/orders/requests/" + key);
    assert.equal(saved.total, "83800");
    assert.deepEqual(await state(), before);
    assert.equal((await api("storefront/orders?q=" + saved.number)).total, 1);
    await capture(v, "receipt-desktop");
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(pub + "/cart");
    await mobile
      .getByRole("heading", { name: "Tu pedido", exact: true })
      .waitFor();
    assert.equal(await mobile.locator("header").count(), 1);
    await capture(mobile, "receipt-mobile");
    await mobile
      .getByRole("button", { name: "Copiar mensaje", exact: true })
      .click();
    await mobile.getByLabel("Mensaje del pedido").waitFor();
    assert.match(
      await mobile.getByLabel("Mensaje del pedido").inputValue(),
      new RegExp(saved.number),
    );
    const popupPromise = mobile.waitForEvent("popup");
    await mobile
      .getByRole("link", { name: "Abrir WhatsApp", exact: true })
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.match(popup.url(), /^https:\/\/wa.me\/12025550123\?/);
    await popup.close();
    assert.equal((await api("storefront/orders?q=" + saved.number)).total, 1);
    const inbox = (await api("storefront/orders?q=" + saved.number)).rows[0];
    await p.goto(owner + "/orders");
    await p.getByLabel("Buscar pedido").fill(saved.number);
    await p
      .getByRole("button", { name: "Ver pedido", exact: true })
      .first()
      .click();
    await p.getByLabel("Detalle del pedido").waitFor();
    assert.match(
      await p.getByLabel("Detalle del pedido").innerText(),
      /83\.800,00/,
    );
    await capture(p, "inbox-desktop");
    await p
      .getByRole("button", { name: "Preparar Nueva venta", exact: true })
      .click();
    await p.getByLabel("Solicitud original").waitFor();
    await p
      .getByRole("button", { name: "Cliente: Consumidor final", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "Elegir cliente" })
      .getByRole("button", { name: customer.name, exact: true })
      .click();
    await p.getByRole("button", { name: "Revisar venta", exact: true }).click();
    const review = p.getByRole("dialog", {
      name: "Revisar venta",
      exact: true,
    });
    await review
      .getByRole("button", { name: "Transferencia", exact: true })
      .click();
    await review
      .getByRole("button", { name: "Cobrar una parte", exact: true })
      .click();
    await review
      .getByLabel("Cobrar ahora (ARS)", { exact: true })
      .fill("30000");
    await capture(p, "sale-review-desktop");
    assert.deepEqual(await state(), before);
    await review
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .click();
    await review.waitFor({ state: "hidden" });
    const final = await state();
    assert.equal(final.sales.length, before.sales.length + 1);
    assert.deepEqual(final.products, [
      [a.id, 19],
      [b.id, 18],
      [hidden.id, 20],
      [c.id, 20],
    ]);
    assert.equal(final.customer.balance, "53800");
    assert.equal(
      final.accounts.find((x) => x.name === "Transferencia").balance,
      "30000",
    );
    assert.equal(
      final.accounts.find((x) => x.name === "Efectivo").balance,
      "0",
    );
    assert.equal(
      (await api("storefront/orders/" + inbox.id)).status,
      "converted",
    );
    await p.reload();
    assert.equal((await api("sales")).length, 1);
    await p.goto(owner + "/orders");
    await p.getByRole("button", { name: /Estado/ }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Todos", exact: true })
      .click();
    await p.getByLabel("Buscar pedido").fill(saved.number);
    await p
      .getByRole("button", { name: "Ver pedido", exact: true })
      .first()
      .click();
    await capture(p, "converted-desktop");
    // Fresh mobile pages prevent browser resize/full-page stitching artifacts.
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
    m.setDefaultTimeout(10000);
    await m.goto(pub);
    await m.locator(".card").first().waitFor();
    await capture(m, "home-mobile");
    await m.goto(pub + "/products/" + a.presentation_id);
    await m.getByRole("button", { name: "Banana", exact: true }).click();
    await capture(m, "detail-mobile");
    await m.goto(pub + "/promos/" + kit.id);
    await m.getByRole("group").first().waitFor();
    await capture(m, "promo-mobile");
    await m.goto(pub + "/cart");
    await m.getByText("Tu carrito está vacío.", { exact: true }).waitFor();
    await capture(m, "empty-cart-mobile");
    await m.goto(pub);
    await m
      .getByLabel("Buscar productos", { exact: true })
      .fill("producto inexistente");
    await m.getByLabel("Buscar productos", { exact: true }).press("Enter");
    await m
      .getByText("No encontramos productos con estos filtros.", { exact: true })
      .waitFor();
    await capture(m, "empty-search-mobile");
    let release;
    const gate = new Promise((r) => (release = r));
    await m.route("**/api/public/storefront/catalog*", async (r) => {
      await gate;
      await r.continue();
    });
    await m.reload({ waitUntil: "domcontentloaded" });
    await m.getByText("Cargando productos…", { exact: true }).waitFor();
    await capture(m, "loading-mobile");
    release();
    await m
      .getByText("No encontramos productos con estos filtros.", { exact: true })
      .waitFor();
    await m.unroute("**/api/public/storefront/catalog*");
    await m.route("**/api/public/storefront/catalog*", (r) => r.abort());
    await m.reload();
    await m
      .getByRole("button", { name: "Volver a intentar", exact: true })
      .waitFor();
    await capture(m, "catalog-error-mobile");
    await m.unroute("**/api/public/storefront/catalog*");
    await m
      .getByRole("button", { name: "Volver a intentar", exact: true })
      .click();
    await m
      .getByText("No encontramos productos con estos filtros.", { exact: true })
      .waitFor();
    assert.ok(calls.every((x) => x.startsWith("/api/public/storefront/")));
    assert.equal((await api("refresh-runs")).length, 0);
    await writeFile(
      out + "/33-showcase.json",
      JSON.stringify(
        {
          ...fixture,
          orderId: inbox.id,
          orderNumber: saved.number,
          revision: d.revision,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
});
