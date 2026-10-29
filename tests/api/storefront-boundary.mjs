import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.PUBLIC_STOREFRONT_URL;
if (!base || !["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Local public ingress required");
test("public ingress serves the storefront and rejects management, unknown routes and mutations", async () => {
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /geva-storefront/);
  assert.equal(
    (await fetch(base + "/api/public/storefront/catalog")).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/api/public/storefront/categories")).status,
    200,
  );
  for (const path of [
    "/api/settings",
    "/api/products",
    "/api/catalog",
    "/api/facets",
    "/api/customers",
    "/api/sales",
    "/api/cash/accounts",
    "/api/providers/1/refresh",
    "/api/supplier-login/status",
    "/api/storefront/draft",
    "/api/storefront/preview",
    "/api/media",
    "/api/images/status",
    "/api/images/" + "a".repeat(64),
    "/api/public/storefront/unknown",
    "/api/public/storefront/categories/private",
    "/api/public/storefront/%63ategories",
    "/api//public/storefront/catalog",
    "/api/public/storefront/%63atalog",
    "/settings",
    "/sales",
    "/store",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(await r.text(), /geva-storefront/, path);
  }
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"])
    assert.equal(
      (await fetch(base + "/api/public/storefront/catalog", { method })).status,
      405,
      method,
    );
});

test("only the exact cart validation POST and cart page are exposed", async () => {
  assert.equal((await fetch(base + "/cart")).status, 200);
  const post = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: [] }),
  };
  const valid = await fetch(
    base + "/api/public/storefront/cart/validate",
    post,
  );
  assert.equal(valid.status, 201);
  assert.deepEqual(await valid.json(), {
    lines: [],
    total: "0",
    currency: "ARS",
  });
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"])
    assert.equal(
      (await fetch(base + "/api/public/storefront/cart/validate", { method }))
        .status,
      405,
    );
  for (const path of [
    "/api/public/storefront/cart",
    "/api/public/storefront/cart/validate/",
    "/api/public/storefront/cart/private",
    "/api/public/storefront/cart/%76alidate",
    "/cart/private",
  ])
    assert.equal((await fetch(base + path, post)).status, 404, path);
  assert.equal(
    (
      await fetch(base + "/api/public/storefront/cart/validate", {
        method: "POST",
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(base + "/api/public/storefront/cart/validate", {
        ...post,
        body: "x".repeat(65537),
      })
    ).status,
    413,
  );
});
