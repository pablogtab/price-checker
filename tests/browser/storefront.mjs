import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const privateBase = process.env.E2E_BASE_URL,
  publicBase = process.env.PUBLIC_STOREFRONT_URL;
if (
  !privateBase ||
  !publicBase ||
  !process.env.E2E_ALLOW_FIXTURES ||
  [privateBase, publicBase].some(
    (x) => !["127.0.0.1", "localhost"].includes(new URL(x).hostname),
  )
)
  throw Error("Local isolated origins required");
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
test("owner edits, previews and publishes; visitors browse desktop and mobile without private requests", async () => {
  const original = await api("storefront/draft");
  await api(
    "storefront/draft",
    { revision: original.revision, entries: [] },
    "PUT",
  );
  const stamp = Date.now(),
    group = "Whey 1 kg " + stamp;
  const a = await api("products", {
    name: "Chocolate",
    variant_group: group,
    selling_price: "28900",
  });
  const b = await api("products", {
    name: "Vainilla",
    variant_group: group,
    selling_price: "28900",
  });
  for (const p of [a, b])
    await api(`products/${p.id}/stock`, { quantity: 5 }, "PUT");
  if (process.env.STOREFRONT_FIXTURE_IMAGE) {
    const data = await readFile(process.env.STOREFRONT_FIXTURE_IMAGE);
    await api(
      `products/${a.id}`,
      {
        name: a.name,
        variant_group: group,
        selling_price: "28900",
        image_data: "data:image/jpeg;base64," + data.toString("base64"),
      },
      "PUT",
    );
  }
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(privateBase + "/store");
    await page
      .getByRole("heading", { name: "Tienda", exact: true })
      .waitFor({ timeout: 10000 });
    await page
      .getByRole("button", { name: /Seleccionar presentación/ })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: group, exact: true })
      .click();
    await page.getByLabel("Título comercial").fill("Whey Protein · 1 kg");
    await page
      .getByLabel("Descripción comercial")
      .fill("Proteína en polvo. Elegí el sabor de tu presentación de 1 kg.");
    await page.getByLabel(a.name, { exact: true }).check();
    await page.getByLabel(b.name, { exact: true }).check();
    if (process.env.STOREFRONT_FIXTURE_IMAGE)
      await page
        .getByRole("button", { name: "Usar imagen de " + a.name, exact: true })
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
      .getByRole("heading", { name: "Whey Protein · 1 kg", exact: true })
      .waitFor();
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/24-editor-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Cerrar vista previa", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/24-editor-mobile.png",
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await page.getByText("Cambios publicados.", { exact: true }).waitFor();
    const requests = [];
    const visitor = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    visitor.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/"))
        requests.push(new URL(r.url()).pathname);
    });
    await visitor.goto(publicBase);
    await visitor
      .getByRole("heading", { name: "Whey Protein · 1 kg", exact: true })
      .waitFor();
    if (process.env.STOREFRONT_FIXTURE_IMAGE)
      await visitor.locator(".card img").evaluate(async (img) => {
        if (!img.complete)
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
        if (!img.naturalWidth) throw Error("Image missing");
      });
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/24-public-desktop.png",
      fullPage: true,
    });
    await visitor.getByRole("link", { name: /Whey Protein/ }).click();
    await visitor
      .getByRole("heading", { name: "Whey Protein · 1 kg", exact: true })
      .waitFor();
    assert.match(visitor.url(), new RegExp("/products/" + a.presentation_id));
    await visitor.getByRole("button", { name: b.name, exact: true }).click();
    assert.equal(
      await visitor
        .getByRole("button", { name: b.name, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/24-detail-desktop.png",
      fullPage: true,
    });
    await visitor.setViewportSize({ width: 390, height: 844 });
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/24-detail-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await visitor.reload();
    await visitor
      .getByRole("heading", { name: "Whey Protein · 1 kg", exact: true })
      .waitFor();
    await visitor.getByRole("button", { name: "Volver al catálogo" }).click();
    await visitor
      .getByRole("heading", { name: "Catálogo", exact: true })
      .waitFor();
    await visitor.getByRole("link", { name: /Whey Protein/ }).waitFor();
    if (process.env.STOREFRONT_FIXTURE_IMAGE)
      await visitor.locator(".card img").evaluate(async (img) => {
        if (!img.complete)
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
      });
    await visitor.screenshot({
      path: "/tmp/gevafit-storefront-context/24-public-mobile.png",
      fullPage: true,
    });
    assert.ok(requests.length > 0);
    assert.ok(
      requests.every((p) =>
        /^\/api\/public\/storefront\/(catalog|presentations\/\d+|images\/[a-f0-9]{64})$/.test(
          p,
        ),
      ),
      JSON.stringify(requests),
    );
  } finally {
    await browser.close();
  }
});
