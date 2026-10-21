# Sales browser integration tests

These tests use a real frontend, REST API and disposable PostgreSQL database.
They create product/customer/sale fixtures through REST; **never target production
or the normal local application database**. Use a new database ending in `_test`
and dedicated API/frontend ports. Do not run suites which truncate that database
concurrently.

1. Create the disposable database and start a compiled API with its
   `DATABASE_URL`, `PORT` and `HOST=127.0.0.1`. Run `npm run build -w apps/api`
   followed by `node apps/api/dist/main.js`; direct `tsx` startup does not emit
   Nest's constructor metadata.
2. Start Angular on a separate port with a proxy config pointing `/api` at that
   API. No Docker rebuild is required.
3. Provide a Playwright installation and an existing Chrome executable:

```sh
E2E_BASE_URL=http://127.0.0.1:4222 E2E_ALLOW_FIXTURES=1 \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node --test tests/browser/sales-flow.mjs
```

`PLAYWRIGHT_MODULE` defaults to the `playwright` package when installed in the
project. `CHROME_EXECUTABLE` defaults to system Chrome on macOS. No browser is
downloaded. Optional `E2E_SCREENSHOTS` points to an existing output directory.
Fixtures are uniquely named and can be inspected after execution; discard the
entire isolated database when finished.

Coverage includes keyboard product addition, quantity consolidation preserving a
manual price, explicit review/cancel, mobile layout, real stock/cash/debt effects,
customer creation without losing the cart, partial payment and a lost response
followed by an idempotent retry.

Sale-wide discount coverage uses the same setup:

```sh
E2E_BASE_URL=http://127.0.0.1:4224 E2E_ALLOW_FIXTURES=1 \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
node --test tests/browser/sales-global-discount.mjs
```

The companion REST suite runs against the same isolated API/PostgreSQL using
`node --test tests/api/sales-discount.mjs`. It verifies authoritative ARS and
percentage calculations, indivisible cents without splitting quantities, promo
rounding, full/partial/zero receipts, limits and unchanged stock on rejection.
The browser suite verifies desktop and mobile review, persistence and detail.
`node --test tests/browser/sales-promos.mjs` uses the same harness to verify
promo flavor selection/cancel, combination repetition, fixed/discounted prices,
manual price preservation, mobile review and exact variant stock consumption.

`node --test tests/browser/sales-drafts.mjs` verifies browser-local draft recovery,
manual/catalog prices and explicit updates, discard, unavailable products,
promo combinations and metadata after closing a tab, and uncertain submissions
both before and after server commit. The latter changes the cart after reload,
then verifies the original immutable attempt causes a single sale, stock change
and receipt. `/api/sales/requests/:key` resolves a submission under the same lock
as sale creation; a retry never uses a new payload for that key.
Run multiple browser files with `--test-concurrency=1` because their cash fixtures
share accounts in the isolated database.

`node --test tests/browser/sales-clean-checkout.mjs` checks direct account choices,
Transferencia as default, account-current requiring a customer, optional partial
collection and return to full collection, plus desktop/mobile layout. Short
payment and discount choices are buttons; long customer/flavor lists retain the
shared searchable selector. Only the review's explicit confirmation saves a sale.

The REST correction suites read sale history using the public `sales?page=N`
pagination helper. They can locate edited fixtures with older dates even when an
isolated test database already contains more than 100 sales; no API limit is raised.
