import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const owner = process.env.E2E_BASE_URL,
  publicBase = process.env.PUBLIC_STOREFRONT_URL;
if (
  !owner ||
  !publicBase ||
  ![owner, publicBase].every((x) =>
    ["localhost", "127.0.0.1"].includes(new URL(x).hostname),
  )
)
  throw Error("Local origins required");
test("owner organizes draft and visitor preserves combined navigation and direct links", async () => {
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
      .getByRole("heading", { name: "Categorías y marcas" })
      .waitFor({ timeout: 8000 });
    await p.getByLabel("Nueva categoría").fill("Recuperación");
    await p
      .getByRole("button", { name: "Crear categoría", exact: true })
      .click();
    await p.getByLabel("Nueva marca").fill("GEVA Natural");
    await p.getByRole("button", { name: "Crear marca", exact: true }).click();
    await p.locator(".entries button").first().click();
    await p.getByLabel("Categoría Recuperación", { exact: true }).check();
    await p.getByRole("button", { name: /Marca comercial/ }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "GEVA Natural", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Bajar producto", exact: false })
      .click();
    await p
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await p.getByText("Borrador guardado.", { exact: true }).waitFor();
    await p.getByRole("button", { name: "Vista previa", exact: true }).click();
    await p
      .getByRole("region", { name: "Vista previa del borrador" })
      .getByRole("button", { name: "Recuperación", exact: true })
      .waitFor();
    await p.getByRole("button", { name: "Cerrar vista previa" }).click();
    await p
      .getByRole("button", { name: "Publicar cambios", exact: true })
      .click();
    await p.getByText("Cambios publicados.", { exact: true }).waitFor();
    await p.screenshot({
      path: "/tmp/gevafit-storefront-context/26-owner-desktop.png",
      fullPage: true,
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({
      path: "/tmp/gevafit-storefront-context/26-owner-mobile.png",
      fullPage: true,
    });
    const v = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const requests = [];
    v.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/"))
        requests.push(new URL(r.url()).pathname);
    });
    await v.goto(publicBase + "/?pageSize=1");
    await v.getByRole("button", { name: "Siguiente", exact: true }).waitFor();
    await v.getByRole("button", { name: "Siguiente", exact: true }).click();
    await v.waitForURL(/page=2/);
    await v.getByRole("button", { name: /Orden:/ }).click();
    await v
      .getByRole("dialog")
      .getByRole("button", { name: "Menor precio", exact: true })
      .click();
    await v.getByRole("link", { name: /Proteína Frutilla/ }).waitFor();
    assert.equal(new URL(v.url()).searchParams.get("page"), "1");
    await v.getByRole("button", { name: "Recuperación", exact: true }).click();
    await v.getByLabel("Buscar productos").fill("vainilla");
    await v.getByLabel("Buscar productos").press("Enter");
    await v.getByRole("button", { name: /Marca/ }).click();
    await v
      .getByRole("dialog")
      .getByRole("button", { name: "GEVA Natural", exact: true })
      .click();
    await v.getByRole("link", { name: /Proteína Vainilla/ }).waitFor();
    assert.match(v.url(), /category=/);
    await v.screenshot({
      path: "/tmp/gevafit-storefront-context/26-public-desktop.png",
      fullPage: true,
    });
    const context = new URL(v.url()).search;
    await v.getByRole("link", { name: /Proteína Vainilla/ }).click();
    await v.reload();
    await v.getByRole("button", { name: "Volver al catálogo" }).click();
    assert.equal(new URL(v.url()).search, context);
    await v.getByRole("link", { name: /Proteína Vainilla/ }).waitFor();
    await v.goBack();
    await v
      .getByRole("heading", { name: "Proteína Vainilla", exact: true })
      .waitFor();
    await v.goForward();
    await v.getByRole("link", { name: /Proteína Vainilla/ }).waitFor();
    await v.setViewportSize({ width: 390, height: 844 });
    await v.screenshot({
      path: "/tmp/gevafit-storefront-context/26-public-mobile.png",
      fullPage: true,
    });
    assert.ok(
      await v.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await v.getByLabel("Buscar productos").fill("inexistente");
    await v.getByLabel("Buscar productos").press("Enter");
    await v.getByText("No encontramos productos con estos filtros.").waitFor();
    assert.ok(
      requests.every((x) =>
        /^\/api\/public\/storefront\/(catalog|categories|presentations\/\d+|images\/[a-f0-9]{64})$/.test(
          x,
        ),
      ),
      requests.join(","),
    );
  } finally {
    await browser.close();
  }
});
