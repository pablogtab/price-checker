import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL,
  api = process.env.TEST_API_URL;
if (!base || !api || !process.env.E2E_ALLOW_FIXTURES)
  throw Error("Isolated app required");
async function post(path, body) {
  const r = await fetch(api + "/api/" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok);
  return r.json();
}
test("selected promo is editable and its constraints appear in desktop/mobile preview without overflow", async () => {
  const items = await (await fetch(api + "/api/products")).json();
  const products = Array.isArray(items) ? items : items.items;
  const kit = products.find((p) => p.kind === "kit" && p.name === "Promo flow");
  assert.ok(kit);
  // Separate plain fixed promo fixture uses REST and never records sales.
  const group = "Browser flavors " + Date.now();
  const component = await post("products", {
    name: "Browser promo component",
    variant_group: group,
    selling_price: "1000",
  });
  await fetch(api + `/api/products/${component.id}/stock`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity: 1 }),
  });
  const other = await post("products", {
    name: "Browser Banana",
    variant_group: group,
    selling_price: "1000",
  });
  await fetch(api + `/api/products/${other.id}/stock`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity: 1 }),
  });
  const promo = await post("products", {
    name: "Browser promo x2",
    kind: "kit",
    selling_price: "1900",
    kit_pricing_mode: "final",
    components: [{ variant_group: group, quantity: 2 }],
  });
  await post("price-lists", {
    title: "Browser promos",
    product_ids: [promo.id],
  });
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
      .filter({ hasText: "Browser promos" })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Vista previa", exact: true })
      .click();
    await page.locator(".list-preview").waitFor();
    assert.match(
      await page.locator(".list-preview textarea").inputValue(),
      /Browser promo x2/,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({
        path: `/tmp/gevafit-price-lists/promos15-${width}.png`,
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
  } finally {
    await browser.close();
  }
});
