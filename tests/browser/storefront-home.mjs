import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.TEST_API_URL,
  owner = process.env.E2E_BASE_URL,
  publicBase = process.env.PUBLIC_STOREFRONT_URL;
if (
  ![base, owner, publicBase].every(
    (x) => x && ["localhost", "127.0.0.1"].includes(new URL(x).hostname),
  )
)
  throw Error("Local origins required");
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
  const v = await r.json();
  assert.ok(r.ok, JSON.stringify(v));
  return v;
}
test("owner edits ordered home, previews, publishes and visitor navigates banners and featured items", async () => {
  const photo = await readFile(
    process.env.STOREFRONT_PHOTO ||
      new URL("../fixtures/media.png", import.meta.url),
  );
  const asset = await api("media", {
    name: "Whey Protein 1 kg",
    data: "data:image/png;base64," + photo.toString("base64"),
  });
  const entries = [];
  for (const [name, price] of [
    ["Whey Protein · 1 kg", "21500"],
    ["Whey Protein · 3 kg", "52000"],
  ]) {
    const p = await api("products", { name, selling_price: price });
    await api(`products/${p.id}/stock`, { quantity: 5 }, "PUT");
    entries.push({
      presentationId: p.presentation_id,
      title: name,
      description: "Proteína de suero. Presentación en polvo.",
      variantIds: [p.id],
      imageKey: null,
      gallery: [asset.id],
      coverMediaId: asset.id,
      variantImages: [],
      categoryIds: ["proteinas"],
      brandId: null,
    });
  }
  let d = await api("storefront/draft");
  await api(
    "storefront/draft",
    {
      ...d,
      entries,
      categories: [{ id: "proteinas", name: "Proteínas" }],
      brands: [],
      home: { featuredIds: [], banners: [] },
    },
    "PUT",
  );
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const p = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await p.goto(owner + "/store");
    await p
      .getByRole("heading", { name: "Inicio de la tienda", exact: true })
      .waitFor();
    for (const e of entries) {
      await p.getByRole("button", { name: /Agregar destacado:/ }).click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: e.title, exact: true })
        .click();
    }
    await p
      .getByRole("button", {
        name: "Subir destacado " + entries[1].title,
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Agregar banner", exact: true })
      .click();
    await p
      .getByLabel("Título del banner", { exact: true })
      .fill("Proteínas de suero");
    await p
      .getByRole("button", { name: "Elegir imagen del banner", exact: true })
      .click();
    await p
      .locator(".media-card")
      .filter({ hasText: "Whey Protein 1 kg" })
      .first()
      .click();
    await p
      .getByRole("button", { name: "Usar esta imagen", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await p.getByText("Borrador guardado.", { exact: true }).waitFor();
    d = await api("storefront/draft");
    assert.deepEqual(d.home.featuredIds, [
      entries[1].presentationId,
      entries[0].presentationId,
    ]);
    await p.getByRole("button", { name: "Vista previa", exact: true }).click();
    const preview = p.getByRole("region", {
      name: "Vista previa del borrador",
    });
    await preview.getByRole("link", { name: /Proteínas de suero/ }).waitFor();
    await preview.getByRole("link", { name: /Proteínas de suero/ }).click();
    await preview
      .getByRole("button", { name: "Proteínas", exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "Cerrar vista previa", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await p.getByText("Cambios publicados.", { exact: true }).waitFor();
    await p.screenshot({
      path: "/tmp/gevafit-storefront-context/28-owner-desktop.png",
      fullPage: true,
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({
      path: "/tmp/gevafit-storefront-context/28-owner-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const v = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await v.goto(publicBase);
    await v.getByRole("link", { name: /Proteínas de suero/ }).waitFor();
    await v
      .locator("img")
      .evaluateAll((imgs) =>
        Promise.all(imgs.map((i) => i.decode().catch(() => {}))),
      );
    assert.match(await v.locator(".featured-card").first().innerText(), /3 kg/);
    await v.screenshot({
      path: "/tmp/gevafit-storefront-context/28-public-desktop.png",
      fullPage: true,
    });
    await v.getByRole("link", { name: /Proteínas de suero/ }).click();
    await v.waitForURL(/category=proteinas/);
    assert.equal(await v.locator(".home-banner").count(), 0);
    await v.getByRole("button", { name: "Todos", exact: true }).click();
    await v.locator(".featured-card").first().click();
    await v
      .getByRole("heading", { name: entries[1].title, exact: true })
      .waitFor();
    await v.reload();
    await v
      .getByRole("heading", { name: entries[1].title, exact: true })
      .waitFor();
    await v
      .getByRole("button", { name: "← Volver al catálogo", exact: true })
      .click();
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await mobile.goto(publicBase);
    await mobile.locator(".home-banner").waitFor();
    await mobile
      .locator("img")
      .evaluateAll((imgs) =>
        Promise.all(imgs.map((i) => i.decode().catch(() => {}))),
      );
    await mobile.screenshot({
      path: "/tmp/gevafit-storefront-context/28-public-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    // Removing a selected product also removes its authored featured reference before saving.
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p
      .locator(".entries button")
      .filter({ hasText: entries[0].title })
      .click();
    await p
      .getByRole("button", { name: "Quitar de la tienda", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await p.getByText("Borrador guardado.", { exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});
