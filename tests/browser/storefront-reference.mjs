import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.E2E_BASE_URL;
if (
  !base ||
  new URL(base).hostname !== "127.0.0.1" ||
  !process.env.E2E_ALLOW_FIXTURES
)
  throw Error("Isolated local fixtures required");
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
test("original order reference formats ARS in es-AR preserving precision and requiring an explicit sale-price correction", async () => {
  const p = await api("products", {
    name: "Referencia decimal",
    selling_price: "1250.255",
  });
  await api(`products/${p.id}/stock`, { quantity: 10 }, "PUT");
  await api("storefront/whatsapp", { number: "12025550123" }, "PUT");
  const state = await api("storefront/draft");
  const d = await api(
    "storefront/draft",
    {
      ...state,
      entries: [
        {
          presentationId: p.presentation_id,
          title: "Proteína · referencia decimal",
          description: "",
          imageKey: null,
          variantIds: [p.id],
        },
      ],
      home: { featuredIds: [], banners: [] },
    },
    "PUT",
  );
  await api("storefront/publish", { revision: d.revision });
  const receipt = await api("public/storefront/orders", {
    requestKey: randomUUID(),
    lines: [
      {
        kind: "product",
        presentationId: p.presentation_id,
        variantId: p.id,
        quantity: 3,
      },
    ],
  });
  const order = (await api("storefront/orders?q=" + receipt.number)).rows[0];
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.goto(base + "/sales/new?order=" + order.id);
    const reference = page.getByLabel("Solicitud original");
    await reference.waitFor();
    const text = await reference.innerText();
    assert.match(text, /\$\s*1\.250,255/);
    assert.match(text, /\$\s*3\.750,765/);
    assert.equal(
      await page
        .getByLabel("Precio unitario (ARS)", { exact: true })
        .inputValue(),
      "1250.255",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Revisar venta", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByLabel("Precio unitario (ARS)", { exact: true })
      .fill("1250.25");
    await page.getByLabel("Precio unitario (ARS)", { exact: true }).blur();
    assert.equal(
      await page
        .getByRole("button", { name: "Revisar venta", exact: true })
        .isDisabled(),
      false,
    );
    assert.equal(
      (await api("storefront/orders/" + order.id)).snapshot.total,
      "3750.765",
    );
    await page.screenshot({
      path: "/tmp/gevafit-storefront-context/33-reference-decimal-mobile-v2.png",
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
});
