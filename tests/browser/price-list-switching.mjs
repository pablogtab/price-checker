import assert from "node:assert/strict";
import { test } from "node:test";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
test("changing a saved list paints immediately without waiting for background polling", async () => {
  const base = process.env.E2E_BASE_URL;
  if (
    !base ||
    !process.env.E2E_ALLOW_FIXTURES ||
    !["localhost", "127.0.0.1"].includes(new URL(base).hostname)
  )
    throw Error("Isolated local app required");
  const api = base + "/api";
  const ps = await (await fetch(api + "/products")).json();
  const stamp = Date.now(),
    lists = [];
  for (let i = 0; i < 2; i++)
    lists.push(
      await (
        await fetch(api + "/price-lists", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: `Cambio ${stamp} ${i}`,
            product_ids: ps
              .filter((p) => p.kind === "product")
              .slice(i * 5, i * 5 + 5)
              .map((p) => p.id),
          }),
        })
      ).json(),
    );
  const b = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const p = await b.newPage();
    await p.goto(base + "/price-lists");
    await p.locator(".lists-index button").first().waitFor();
    const timings = [];
    for (let i = 0; i < 8; i++) {
      const l = lists[i % 2],
        start = performance.now();
      await p
        .locator(".lists-index button")
        .filter({ hasText: l.title })
        .click();
      await p.waitForFunction(
        (title) =>
          document.querySelector(".list-editor > label input")?.value === title,
        l.title,
      );
      timings.push(Math.round(performance.now() - start));
    }
    console.log(JSON.stringify({ products: ps.length, timings_ms: timings }));
    assert.ok(
      Math.max(...timings) < 750,
      "Switching lists should render within750ms",
    );
  } finally {
    await b.close();
  }
});
