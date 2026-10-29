import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.PUBLIC_STOREFRONT_URL;
if (!base || new URL(base).hostname !== "127.0.0.1")
  throw Error("Local public origin required");
test("visitor can type during catalog loading without the completed request clearing their search", async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.setDefaultTimeout(6000);
    let release;
    const gate = new Promise((r) => (release = r));
    await p.route("**/api/public/storefront/catalog*", async (r) => {
      await gate;
      await r.continue();
    });
    await p.goto(base, { waitUntil: "domcontentloaded" });
    await p.getByText("Cargando productos…", { exact: true }).waitFor();
    await p
      .getByLabel("Buscar productos", { exact: true })
      .fill("producto inexistente");
    release();
    await p.locator(".card").first().waitFor();
    assert.equal(
      await p.getByLabel("Buscar productos", { exact: true }).inputValue(),
      "producto inexistente",
    );
    await p.getByLabel("Buscar productos", { exact: true }).press("Enter");
    await p
      .getByText("No encontramos productos con estos filtros.", { exact: true })
      .waitFor();
  } finally {
    await browser.close();
  }
});

test("catalog network failure gives a direct Spanish message and recovers on retry", async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.route("**/api/public/storefront/catalog*", (r) => r.abort());
    await page.goto(base);
    const alert = page.getByRole("alert");
    await alert.waitFor();
    assert.match(await alert.innerText(), /No se pudo cargar el catálogo/);
    await page.unroute("**/api/public/storefront/catalog*");
    await page
      .getByRole("button", { name: "Volver a intentar", exact: true })
      .click();
    await page.locator(".card").first().waitFor();
  } finally {
    await browser.close();
  }
});
