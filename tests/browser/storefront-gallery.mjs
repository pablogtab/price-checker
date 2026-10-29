import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL,
  publicBase = process.env.PUBLIC_STOREFRONT_URL;
if (
  !base ||
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname) ||
  !process.env.E2E_ALLOW_FIXTURES
)
  throw Error("Local fixtures required");
test("owner arranges gallery and visitor changes flavor with common fallback", async () => {
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
  const group = "Gallery browser " + Date.now(),
    a = await api("products", {
      name: "Chocolate",
      variant_group: group,
      selling_price: "28900",
    }),
    b = await api("products", {
      name: "Vainilla",
      variant_group: group,
      selling_price: "28900",
    });
  for (const p of [a, b])
    await api(`products/${p.id}/stock`, { quantity: 3 }, "PUT");
  const assets = [];
  for (const color of ["red", "blue", "green"]) {
    const image =
      color === "red" && process.env.STOREFRONT_FIXTURE_IMAGE
        ? await readFile(process.env.STOREFRONT_FIXTURE_IMAGE)
        : await sharp({
            create: {
              width: 800,
              height: 1000,
              channels: 3,
              background: color,
            },
          })
            .png()
            .toBuffer();
    assets.push(
      await api("media", {
        name: "Gallery " + color,
        data: "data:image/png;base64," + image.toString("base64"),
      }),
    );
  }
  const draft = await api("storefront/draft");
  await api(
    "storefront/draft",
    {
      revision: draft.revision,
      entries: [
        {
          presentationId: a.presentation_id,
          title: "Whey · 1 kg",
          description: "Proteína en polvo. Presentación de 1 kg.",
          imageKey: null,
          variantIds: [a.id, b.id],
          gallery: [assets[1].id],
          coverMediaId: assets[1].id,
          variantImages: [],
        },
      ],
    },
    "PUT",
  );
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    await page.goto(base + "/store");
    await page
      .getByRole("button", { name: "Whey · 1 kg", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Galería de la presentación", exact: true })
      .waitFor({ timeout: 5000 });
    await page
      .getByRole("button", { name: "Agregar desde biblioteca" })
      .click();
    await page
      .getByRole("region", { name: "Biblioteca de imágenes" })
      .getByRole("button", { name: /Gallery red/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Usar esta imagen", exact: true })
      .click();
    assert.equal(await page.locator(".gallery-item").count(), 2);
    await page.getByRole("button", { name: "Mover foto 2 arriba" }).click();
    await page
      .getByRole("button", { name: "Elegir foto 1 como portada" })
      .click();
    await page
      .locator(".gallery-item")
      .first()
      .dragTo(page.locator(".gallery-item").last());
    assert.equal(
      await page
        .locator(".gallery-item")
        .last()
        .getByRole("button", {
          name: "Elegir foto 2 como portada",
          exact: true,
        })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page
      .getByRole("button", { name: "Imagen para Chocolate", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Biblioteca de imágenes" })
      .getByRole("button", { name: /Gallery green/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Usar esta imagen", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await page.getByText("Borrador guardado.", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Vista previa del borrador" })
      .getByRole("link", { name: /Whey/ })
      .click();
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/merge27-editor-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cerrar vista previa" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator("app-storefront-gallery-editor")
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/merge27-editor-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await page.getByText("Cambios publicados.", { exact: true }).waitFor();
    const visitor = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const requests = [];
    visitor.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/"))
        requests.push(new URL(r.url()).pathname);
    });
    await visitor.goto(publicBase);
    await visitor.getByRole("link", { name: /Whey/ }).click();
    await visitor.locator(".detail-photo img").waitFor();
    const common = await visitor
      .locator(".detail-photo img")
      .getAttribute("src");
    await visitor
      .getByRole("button", { name: "Chocolate", exact: true })
      .click();
    assert.notEqual(
      await visitor.locator(".detail-photo img").getAttribute("src"),
      common,
    );
    await visitor
      .getByRole("button", { name: "Vainilla", exact: true })
      .click();
    assert.equal(
      await visitor.locator(".detail-photo img").getAttribute("src"),
      common,
    );
    await visitor
      .getByRole("button", { name: "Ver foto 2", exact: true })
      .click();
    await visitor.locator(".detail-photo img").evaluate((img) => img.decode());
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/merge27-detail-desktop.png",
      fullPage: true,
    });
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await mobile.goto(publicBase + "/products/" + a.presentation_id);
    await mobile
      .getByRole("heading", { name: "Whey · 1 kg", exact: true })
      .waitFor();
    await mobile.locator(".detail-photo img").evaluate((img) => img.decode());
    await mobile.screenshot({
      path: "/tmp/gevafit-storefront-context/merge27-detail-mobile-final.png",
      fullPage: true,
    });
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.ok(
      requests.every((p) =>
        /^\/api\/public\/storefront\/(catalog|presentations\/\d+|media\/\d+\/(mobile|desktop))$/.test(
          p,
        ),
      ),
      JSON.stringify(requests),
    );
    for (const path of [
      "/api/media",
      "/api/media/" + assets[0].id + "/file/mobile",
      "/api/public/storefront/media/" + assets[0].id + "/original",
    ])
      assert.equal((await fetch(publicBase + path)).status, 404);
  } finally {
    await browser.close();
  }
});
