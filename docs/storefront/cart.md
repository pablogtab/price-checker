# Public cart

`POST /api/public/storefront/cart/validate` accepts `{lines: CartInput[]}`.

- Product: `{kind:'product', presentationId, variantId, quantity}`.
- Promo: `{kind:'promo', promoId, selections:[{componentId,unitIndex,variantId}], quantity}`. Each component unit has exactly one selection, zero-based unit indices. The IDs come from the published promo DTO; no replacement is inferred.

The response is `{lines,total,currency:'ARS'}`. Valid lines retain their canonical identity and quantity and add public `title`, `labels`, `price`, `subtotal`, `imageUrl`. Money is returned as decimal strings. Promo selections are ordered by component ID and unit index. Different compositions remain separate lines; the browser merges identical identities when adding again.

The API validates all lines in one repeatable-read transaction, calling the same published presentation/promo readers as the public detail endpoints. Current common prices and the existing promo pricing/rounding rules apply. Withdrawn variants, publications, or incomplete/ineligible promo compositions are silently omitted. A single invalid unit removes the entire promo line. No stock quantity comparison, reservation, sale, payment or order write occurs.

Technical bounds: 100 lines, 100 selections per promo, quantities from 1 through 1,000,000 (safe integers), positive safe IDs. Malformed envelopes/numbers return 400 without a replacement cart. The deny-by-default public ingress permits only this exact POST route and caps JSON bodies at 64 KiB; GET/HEAD and other methods on that endpoint are rejected. `/cart` is the only added public page path.

`StorefrontCart` is started by the public root only. Local storage key `gevafit-public-cart-v1` stores identities, compositions and quantities plus optional cached public title/labels for a readable network-error state. It never stores prices, costs, stock, personal data or private objects. Reload/reopen restores and revalidates. Storage events synchronize other open tabs. Successful responses replace only the newest request's cart; network/server failures keep existing lines. Totals/subtotals remain hidden until validation succeeds. Quantity input rejects invalid values and restores the previous valid number. No customer form or checkout/WhatsApp action is present in this ticket; order creation belongs to #31.

The shared catalog/detail view defaults to a read-only preview. Only the public root enables cart controls; unpublished management preview entries cannot be added through the preview.
