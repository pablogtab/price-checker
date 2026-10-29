# Storefront discovery

Storefront revision content owns commercial categories, brands, assignments and
manual ordering. It never writes provider text or the general product order.

`GET/PUT /api/storefront/draft` includes ordered `categories` and `brands` arrays,
each with stable string `id` and editable `name`. Entries select `categoryIds`
(multiple) and nullable `brandId`. Array order of entries is the store order;
category optional `productIds` overrides that category's order. Product keys are
presentation IDs or `promo-<id>` keys. Omitted selected keys follow store order.
An entry-only legacy draft save retains current category/brand metadata.

The same immutable revision is previewed and atomically published. Removing a
category or brand in the editor removes its assignments from the draft.

Public catalog accepts `q`, `category`, `brand`, `order` (`manual`, `price-asc`,
`price-desc`), `page` and `pageSize` (maximum 48). Search ignores accents and matches
commercial text/brand and only selected eligible flavors. Price ties have a stable
entity ID order. Price and eligibility are live, while content uses the published
revision. Requests may supply `revision` from the first page; a newer publication
returns 409, and the public UI reloads page one using current content.

Public categories endpoint returns only stable IDs and names, including empty
categories, with no internal counts or order references. Catalog and detail DTOs
add category IDs and the commercial brand's ID/name. Public ingress permits only
the exact categories endpoint alongside its existing explicit routes.

Browser navigation stores filters, search, order, page size/page and revision in
the query string. Detail URLs and actual card hrefs preserve that query. Reload,
direct links and browser history do not depend on private bootstrap or local
session state.
