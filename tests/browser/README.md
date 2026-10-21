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
