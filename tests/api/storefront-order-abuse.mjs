import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.PUBLIC_STOREFRONT_URL,
  api = process.env.TEST_API_URL;
if (![base, api].every((v) => v && new URL(v).hostname === "127.0.0.1"))
  throw Error("local only");
test("spoofed forwarding headers cannot bypass bounded public and direct order request limits", async () => {
  let publicLimited = 0,
    directLimited = 0;
  for (let i = 0; i < 125; i++) {
    const headers = {
      "x-forwarded-for": `198.51.100.${i}`,
      forwarded: `for=198.51.100.${i}`,
    };
    const r = await fetch(
      base + "/api/public/storefront/orders/receipts/" + "a".repeat(64),
      { headers },
    );
    assert.ok([404, 429].includes(r.status));
    if (r.status === 429) publicLimited++;
    const d = await fetch(api + "/api/public/storefront/orders", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: "{}",
    });
    assert.ok([400, 429].includes(d.status));
    if (d.status === 429) directLimited++;
  }
  assert.ok(publicLimited >= 5);
  assert.ok(directLimited >= 5);
});
