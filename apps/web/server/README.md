# Local public storefront entry

The public Angular build has its own root, styles and HTTP entry. It never
bootstraps the management AppComponent. The existing private proxy and
production compose configuration remain private surfaces.

Build both surfaces with `npm run build`, or only the public bundle with:

```sh
npm run build:storefront -w apps/web
PORT=4315 STOREFRONT_API_URL=http://127.0.0.1:3215 npm run start:storefront -w apps/web
```

The listener binds `127.0.0.1` by default. Set `PUBLIC_BUILD_ROOT` to override the
compiled `apps/web/dist/storefront/browser` directory. Restart after rebuilding:
the listener inventories emitted assets once. This is a local entry; exposing a
production hostname requires its own deployment configuration and verification.

`public-entry.mjs` is the security boundary: exact route and method allowlist,
no wildcard API proxy, no management fallback, and no raw media directory.
Published image requests must also pass the API publication-reference check.
When adding a public endpoint, extend its exact pattern/method and the boundary
regression suite. Never proxy all `/api` or `/api/public/storefront` paths.

Tests use separate origins. Fixtures and owner editing go through the private
API/frontend; the public listener must reject those same routes. Only target a
unique disposable PostgreSQL database ending `_test`, never the normal database.

```sh
TEST_API_URL=http://127.0.0.1:3264 \
TEST_STOREFRONT_DATABASE_URL=postgres://price_checker:local_price_checker@127.0.0.1:5442/storefront_public_20261029_test \
node --test tests/api/storefront-content.mjs
PUBLIC_STOREFRONT_URL=http://127.0.0.1:4364 node --test tests/api/storefront-boundary.mjs
E2E_BASE_URL=http://127.0.0.1:4264 PUBLIC_STOREFRONT_URL=http://127.0.0.1:4364 \
E2E_ALLOW_FIXTURES=1 PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
node --test tests/browser/storefront.mjs
```

Optional `STOREFRONT_FIXTURE_IMAGE` uploads an existing local JPG/PNG/WebP/GIF as a
private fixture image. Browser screenshots are saved under the existing
`/tmp/gevafit-storefront-context` directory. Run suites sequentially when sharing
an isolated database: they deliberately replace the draft for their own fixture.
