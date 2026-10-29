# Private media library

`/media` is independent of storefront publication and categories. It supports per-file uploads/retries, search, pagination, explicit imports from cached product/supplier photos and resource selection. Imported sources and their assignments are never modified. Identical bytes reuse one asset even during concurrent uploads.

The API preserves original files in the existing `IMAGE_ROOT` (persistent volume). WebP derivatives live in `IMAGE_ROOT/media`: mobile fits 640×640; desktop fits 1600×1600, without enlargement. Sharp decodes received bytes, limits decoded images to 40 megapixels and rejects corrupt data. Existing JPEG, PNG, GIF and WebP / 5 MB rules apply. Animated originals are preserved; delivery derivatives use the first frame. Sharp is a runtime dependency installed from the package lock; install platform optional dependencies on the deployment platform.

Private API:

- `GET /api/media?page=1&limit=24&search=` → `{items,total,page,limit}` (limit max60).
- `POST /api/media {name,data}` → asset; data is an image data URL. Multiple selection uses independent requests so one failure cannot roll back another successful file.
- `GET /api/media/:id` → asset with `usages`.
- `GET /api/media/:id/file/original|mobile|desktop` → binary, private/no-store.
- `GET /api/media/sources?page=1` → 24 cached source candidates.
- `POST /api/media/import {source:'product'|'supplier',id}` → asset; never downloads from supplier.

An asset contains `id,content_hash,name,mime,bytes,width,height,created_at,url,thumbnail_url,usages`. Usage records contain `owner_type,owner_id,slot,label`.

`media.ts` exports `getMediaAsset(id,manager?)`, `mediaFile(id,size)` and `replaceMediaUsages(manager,ownerType,ownerId,slot,assetIds,label)`. A gallery/banner owner calls replace inside its own transaction. The owner stores ordering/cover in its schema. Replacing one slot never deletes assets, originals or another owner's usages. There is deliberately no destructive resource endpoint or arbitrary HTTP usage mutation.

`MediaLibraryComponent` can be embedded using `[selectionMode]="true"` and `(assetSelected)`; selection emits the asset DTO. It does not assign/publish on its own.

Keep `/api/media` and generic `/api/images` behind the existing private management ingress. A public controller must first verify an asset belongs to the published content before serving a derivative; an ID/hash alone is never publication authorization. This ticket creates no public routes or publication schema. Public ingress isolation is verified by the later access-boundary ticket.

Local validation uses a dedicated API, frontend and disposable `_test` PostgreSQL database. Run `node --test tests/media-rest.mjs` against `MEDIA_API` (default3265), `DATABASE_URL=<disposable _test URL> node --test tests/media-preservation.mjs`, and the browser suite with `E2E_BASE_URL`, `E2E_ALLOW_FIXTURES=1`, `PLAYWRIGHT_MODULE` following `tests/browser/README.md`. Never use operational data. Browser captures are written under `/tmp/media-library-{desktop,mobile}.png`.
