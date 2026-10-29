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

test("only exact order creation and opaque own-request receipt routes are public", async () => {
  const endpoint = base + "/api/public/storefront/orders";
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"])
    assert.equal((await fetch(endpoint, { method })).status, 405);
  for (const path of [
    "/api/public/storefront/orders/",
    "/api/public/storefront/orders/1",
    "/api/public/storefront/orders/requests",
    "/api/public/storefront/orders/receipts",
    "/api/public/storefront/orders/%72equests/x",
    "/api/storefront/whatsapp",
    "/api/storefront/orders",
    "/api/media",
  ])
    assert.equal((await fetch(base + path)).status, 404, path);
  assert.equal(
    (await fetch(endpoint, { method: "POST", body: "{}" })).status,
    415,
  );
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{broken",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ junk: "x".repeat(66000) }),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestKey: "bad", lines: [] }),
      })
    ).status,
    400,
  );
  const absent = await fetch(
    base +
      "/api/public/storefront/orders/requests/00000000-0000-4000-8000-000000000000",
  );
  assert.equal(absent.status, 404);
  assert.equal(absent.headers.get("cache-control"), "no-store");
  assert.equal(absent.headers.get("referrer-policy"), "no-referrer");
});

test("private inbox, source sale pages and sensitive resources remain absent from the public entry", async () => {
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    for (const path of [
      "/orders",
      "/sales/new?order=1",
      "/api/storefront/orders",
      "/api/storefront/orders/1",
      "/api/storefront/orders/1/discard",
      "/api/sales/1",
      "/api/customers/1",
      "/api/customers/1/ledger",
      "/api/products/1/stock",
      "/api/presentations",
      "/api/media/1/file/original",
      "/api/storefront/preview",
    ]) {
      const response = await fetch(base + path, { method });
      assert.equal(response.status, 404, method + " " + path);
      assert.doesNotMatch(await response.text(), /geva-storefront/);
    }
  }
});
