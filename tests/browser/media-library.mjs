import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated app required");
test("library supports multiple uploads, retry, selection, search and mobile", async () => {
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await page.goto(base + "/media");
    await page
      .getByRole("heading", { name: "Biblioteca de imágenes", exact: true })
      .waitFor({ timeout: 5000 });
    await page.getByLabel("Subir imágenes").setInputFiles([
      {
        name: "Foto navegador.png",
        mimeType: "image/png",
        buffer: await (
          await import("node:fs/promises")
        ).readFile(new URL("../fixtures/media.png", import.meta.url)),
      },
      {
        name: "Archivo inválido.png",
        mimeType: "image/png",
        buffer: Buffer.from("<html>"),
      },
    ]);
    await page.getByText("Guardada", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Reintentar" }).waitFor();
    await page.locator(".media-card").first().click();
    await page.getByRole("heading", { name: "Imagen seleccionada" }).waitFor();
    assert.equal(
      await page
        .getByRole("heading", { name: "Tipo de cambio", exact: true })
        .count(),
      0,
    );
    await page.screenshot({
      path: "/tmp/media-library-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: "/tmp/media-library-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .getByRole("searchbox", { name: "Buscar imágenes" })
      .fill("sin coincidencias");
    await page
      .getByText(
        "No hay imágenes para mostrar. Subí archivos o incorporá imágenes existentes.",
        { exact: true },
      )
      .waitFor();
    await page.getByRole("searchbox", { name: "Buscar imágenes" }).fill("");
    await page.locator(".media-card").first().waitFor();
    await page.route(
      "**/api/media",
      (route) =>
        route.request().method() === "POST"
          ? route.abort("failed")
          : route.continue(),
      { times: 1 },
    );
    await page
      .getByLabel("Subir imágenes")
      .setInputFiles({
        name: "Reintento red.png",
        mimeType: "image/png",
        buffer: await (
          await import("node:fs/promises")
        ).readFile(new URL("../fixtures/media.png", import.meta.url)),
      });
    const retryRow = page
      .locator(".upload-queue li")
      .filter({ hasText: "Reintento red.png" });
    await retryRow.getByRole("button", { name: "Reintentar" }).click();
    await retryRow.getByText("Guardada", { exact: true }).waitFor();
    await page.reload();
    await page.locator(".media-card").first().waitFor();
  } finally {
    await browser.close();
  }
});
