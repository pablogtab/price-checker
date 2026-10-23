import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (!base || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated app required");
test("stale data warns without blocking copy; inline order policy autosaves on desktop and mobile", async () => {
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await page.goto(base + "/price-lists");
    await page
      .locator(".lists-index button")
      .filter({ hasText: "Pedidos" })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.locator(".list-preview").waitFor();
    await page.locator(".list-warning-toast").waitFor();
    assert.equal(
      await page.getByRole("checkbox", { name: /Confirmo incluir/ }).count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Copiar texto", exact: true })
        .isEnabled(),
      true,
    );
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copiar texto", exact: true })
      .click();
    await page.waitForFunction(() =>
      navigator.clipboard.readText().then((t) => t.includes("Pedidos")),
    );
    assert.doesNotMatch(
      await page.evaluate(() => navigator.clipboard.readText()),
      /Sujeto a disponibilidad del proveedor/,
    );
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route("**/api/price-lists/*/preview", async (route) => {
      await held;
      await route.fulfill({
        status: 500,
        body: "{}",
        contentType: "application/json",
      });
    });
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator(".list-preview").count(),
      0,
      "regeneration immediately removes old generated text",
    );
    release();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.locator(".list-preview").count(),
      0,
      "failed regeneration cannot reuse an old snapshot",
    );
    await page.unroute("**/api/price-lists/*/preview");
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.locator(".list-preview").waitFor();
    await page.locator(".list-warning-toast").waitFor();
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/orders14-desktop.png",
    });
    await page.getByRole("button", { name: "Cerrar advertencia" }).click();
    await page.locator(".list-warning-toast").waitFor({ state: "detached" });
    const days = page.getByRole("spinbutton", {
      name: "Entrega estimada (días)",
    });
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/price-list-order-policy") &&
        r.request().method() === "PUT" &&
        r.ok(),
    );
    const nextDays = (await days.inputValue()) === "10" ? 11 : 10;
    await days.fill(String(nextDays));
    await days.blur();
    await saved;
    assert.equal(await page.locator(".list-preview").count(), 0);
    const policy = await (
      await page.request.get(base + "/api/price-list-order-policy")
    ).json();
    assert.equal(policy.days, nextDays);
    const toggle = page.locator(".list-product-row .order-toggle").first();
    const prior = await toggle.getAttribute("aria-pressed");
    const savedToggle = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/price-list-order-policy") &&
        r.request().method() === "PUT" &&
        r.ok(),
    );
    await toggle.click();
    await savedToggle;
    await page.waitForFunction(
      ({ prior }) =>
        document
          .querySelector(".list-product-row .order-toggle")
          .getAttribute("aria-pressed") !== prior,
      { prior },
    );
    const changedPolicy = await (
      await page.request.get(base + "/api/price-list-order-policy")
    ).json();
    const name = (await toggle.getAttribute("aria-label")).replace(
      "Por encargo: ",
      "",
    );
    assert.equal(
      changedPolicy.products.find((p) => p.name === name).allowed,
      prior !== "true",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/gevafit-price-lists/orders14-mobile.png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  } finally {
    await browser.close();
  }
});
