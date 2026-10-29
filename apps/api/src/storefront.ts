import {
  retainedHome,
  homeContent,
  validateHomeMedia,
  syncHomeUsages,
  publicHome,
} from "./storefront-home";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import Decimal from "decimal.js";
import { EntityManager } from "typeorm";
import { db } from "./db";
import { cachedImage } from "./images";
import { kitSellingPrice } from "./bundles";
import { orderAvailability, invalidateOrderPolicy } from "./price-list-orders";
import { getMediaAsset, mediaFile, replaceMediaUsages } from "./media";
interface Content {
  gallery?: number[];
  coverMediaId?: number | null;
  variantImages?: { variantId: number; mediaId: number }[];
  categoryIds?: string[];
  brandId?: string | null;
  title: string;
  description: string;
  imageKey: string | null;
}
export type StorefrontEntry = Content &
  (
    | { kind?: "product"; presentationId: number; variantIds: number[] }
    | {
        kind: "promo";
        promoId: number;
        promoComponents: { componentId: number; variantIds: number[] }[];
      }
  );
export function storefrontEntryId(e: StorefrontEntry): number | string {
  return e.kind === "promo" ? `promo-${e.promoId}` : e.presentationId;
}
export interface StorefrontProduct {
  categoryIds?: string[];
  brand?: StorefrontFacet | null;
  id: number | string;
  kind?: "promo";
  components?: {
    componentId: number;
    label: string;
    quantity: number;
    variants: { id: number; label: string }[];
  }[];
  title: string;
  description: string;
  price: string;
  currency: "ARS";
  imageUrl: string | null;
  gallery?: { url: string; srcset: string }[];
  imageSrcset?: string;
  variants: {
    id: number;
    label: string;
    imageUrl?: string | null;
    imageSrcset?: string;
  }[];
}
export async function storefrontDraft() {
  const [r] = await db.query(
    'SELECT r.id revision,r.entries,r.categories,r.brands,r.home,s.published_revision_id "publishedRevision" FROM storefront_state s JOIN storefront_revisions r ON r.id=s.draft_revision_id WHERE s.id=1',
  );
  return r;
}
function entries(value: unknown): StorefrontEntry[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new BadRequestException("Selección inválida");
  const seen = new Set<number | string>();
  const validIds = (ids: any) =>
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= 1000 &&
    ids.every((id: any) => Number.isSafeInteger(id) && id > 0) &&
    new Set(ids).size === ids.length;
  return value.map((x) => {
    const promo = x?.kind === "promo";
    if (
      !x ||
      (x.kind !== undefined && x.kind !== "product" && x.kind !== "promo") ||
      typeof x.title !== "string" ||
      !x.title.trim() ||
      x.title.length > 180 ||
      typeof x.description !== "string" ||
      x.description.length > 10000 ||
      (x.imageKey !== null && !/^[a-f0-9]{64}$/.test(x.imageKey))
    )
      throw new BadRequestException("Revisá título, sabores e imagen");
    if (
      promo
        ? !Number.isSafeInteger(x.promoId) ||
          x.promoId < 1 ||
          !Array.isArray(x.promoComponents) ||
          !x.promoComponents.length ||
          x.promoComponents.length > 100 ||
          x.promoComponents.some(
            (c: any) =>
              !Number.isSafeInteger(c.componentId) ||
              c.componentId < 1 ||
              !validIds(c.variantIds),
          ) ||
          new Set(x.promoComponents.map((c: any) => c.componentId)).size !==
            x.promoComponents.length
        : !Number.isSafeInteger(x.presentationId) ||
          x.presentationId < 1 ||
          !validIds(x.variantIds)
    )
      throw new BadRequestException("Selección inválida");
    const gallery = x.gallery ?? [],
      coverMediaId = x.coverMediaId ?? gallery[0] ?? null,
      variantImages = x.variantImages ?? [];
    if (
      !Array.isArray(gallery) ||
      gallery.length > 30 ||
      gallery.some((id) => !Number.isSafeInteger(id) || id < 1) ||
      new Set(gallery).size !== gallery.length ||
      (coverMediaId !== null && !gallery.includes(coverMediaId)) ||
      !Array.isArray(variantImages) ||
      variantImages.length > (promo ? 0 : x.variantIds.length) ||
      variantImages.some(
        (v) =>
          !v ||
          !(promo ? [] : x.variantIds).includes(v.variantId) ||
          !Number.isSafeInteger(v.mediaId) ||
          v.mediaId < 1,
      ) ||
      new Set(variantImages.map((v) => v.variantId)).size !==
        variantImages.length
    )
      throw new BadRequestException(
        "Revisá galería, portada e imágenes de sabores",
      );
    const entry: StorefrontEntry = {
      title: x.title.trim(),
      description: x.description.trim(),
      imageKey: x.imageKey,
      categoryIds: x.categoryIds ?? [],
      brandId: x.brandId ?? null,
      ...(promo
        ? {
            kind: "promo" as const,
            promoId: x.promoId,
            promoComponents: x.promoComponents.map((c: any) => ({
              componentId: c.componentId,
              variantIds: c.variantIds,
            })),
          }
        : { presentationId: x.presentationId, variantIds: x.variantIds }),
      ...(x.gallery !== undefined || x.variantImages !== undefined
        ? {
            gallery,
            coverMediaId,
            variantImages: variantImages.map((v) => ({
              variantId: v.variantId,
              mediaId: v.mediaId,
            })),
          }
        : {}),
    };
    const id = storefrontEntryId(entry);
    if (seen.has(id)) throw new BadRequestException("Selección duplicada");
    seen.add(id);
    return entry;
  });
}
export interface StorefrontFacet {
  id: string;
  name: string;
  productIds?: (number | string)[];
}
function facets(value: unknown): StorefrontFacet[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new BadRequestException("Organización inválida");
  const seen = new Set<string>();
  return value.map((x) => {
    if (
      !x ||
      typeof x.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(x.id) ||
      seen.has(x.id) ||
      typeof x.name !== "string" ||
      !x.name.trim() ||
      x.name.length > 100
    )
      throw new BadRequestException("Revisá categorías y marcas");
    seen.add(x.id);
    if (
      x.productIds !== undefined &&
      (!Array.isArray(x.productIds) ||
        x.productIds.length > 1000 ||
        new Set(x.productIds).size !== x.productIds.length ||
        x.productIds.some(
          (id: unknown) =>
            !(Number.isSafeInteger(id) && Number(id) > 0) &&
            !(typeof id === "string" && /^promo-[1-9][0-9]*$/.test(id)),
        ))
    )
      throw new BadRequestException("Orden de productos inválido");
    return {
      id: x.id,
      name: x.name.trim(),
      ...(x.productIds ? { productIds: x.productIds } : {}),
    };
  });
}
export async function saveStorefrontDraft(body: any) {
  const content = entries(body.entries);
  return db.transaction(async (em) => {
    const [state] = await em.query(
      "SELECT * FROM storefront_state WHERE id=1 FOR UPDATE",
    );
    if (state.draft_revision_id !== body.revision)
      throw new ConflictException("El borrador cambió. Volvé a cargarlo.");
    const [previous] = await em.query(
      "SELECT categories,brands,home FROM storefront_revisions WHERE id=$1",
      [state.draft_revision_id],
    );
    const categories = facets(body.categories ?? previous.categories),
      brands = facets(body.brands ?? previous.brands);
    for (const entry of content) {
      if (
        !Array.isArray(entry.categoryIds) ||
        new Set(entry.categoryIds).size !== entry.categoryIds.length ||
        entry.categoryIds.some((id) => !categories.some((c) => c.id === id)) ||
        (entry.brandId !== null && !brands.some((b) => b.id === entry.brandId))
      )
        throw new BadRequestException(
          "Revisá las asignaciones de categorías y marca",
        );
    }
    const home = homeContent(
      body.home ?? retainedHome(previous.home, content, categories),
      content,
      categories,
    );
    await validateHomeMedia(home);
    await validateMedia(content, em);
    const [r] = await em.query(
      "INSERT INTO storefront_revisions(entries,categories,brands,home) VALUES($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb) RETURNING id",
      [
        JSON.stringify(content),
        JSON.stringify(categories),
        JSON.stringify(brands),
        JSON.stringify(home),
      ],
    );
    await syncHomeUsages(em, "storefront_draft", home, previous.home);
    await em.query(
      "UPDATE storefront_state SET draft_revision_id=$1 WHERE id=1",
      [r.id],
    );
    await syncMediaUsages(em, "storefront_draft", content);
    return {
      revision: r.id,
      entries: content,
      categories,
      brands,
      home,
      publishedRevision: state.published_revision_id,
    };
  });
}
// Same manual permission and current successful-catalog offers as private lists.
export function storefrontEligible(p: any) {
  return (
    !p.archived &&
    p.kind === "product" &&
    !!p.storefrontAvailability?.availability
  );
}
async function products(em: EntityManager, entry: { variantIds: number[] }) {
  const rows = await em.query(
    "SELECT p.id,p.name,p.presentation_id,p.archived,p.kind,p.own_stock,p.variant_group,p.selling_price::text,p.price_list_order_allowed,r.catalog_price::text price FROM products p JOIN presentations r ON r.id=p.presentation_id WHERE p.id=ANY($1::int[]) ORDER BY p.id",
    [entry.variantIds],
  );
  const offers = await em.query(
    `SELECT l.product_id,s.available,s.stock::text,l.provider_id,p.name provider_name,p.last_success_at,r.status latest_status,r.finished_at latest_at FROM product_links l JOIN providers p ON p.id=l.provider_id JOIN supplier_items s ON s.id=l.individual_item_id OR s.id=l.kit_item_id LEFT JOIN LATERAL (SELECT status,finished_at FROM refresh_runs WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true WHERE l.product_id=ANY($1::int[])`,
    [entry.variantIds],
  );
  return rows.map((p: any) => ({
    ...p,
    storefrontAvailability: orderAvailability(p, offers, new Date()),
  }));
}
async function validImage(em: EntityManager, entry: StorefrontEntry) {
  if (!entry.imageKey) return;
  const [r] = await em.query(
    `SELECT 1 FROM products p WHERE ((p.presentation_id=$1 AND $3::int IS NULL) OR p.id=$3) AND (p.custom_image_path=$2 OR EXISTS(SELECT 1 FROM product_links l JOIN supplier_items s ON s.id=l.individual_item_id OR s.id=l.kit_item_id WHERE l.product_id=p.id AND s.image_path=$2)) LIMIT 1`,
    [
      entry.kind === "promo" ? null : entry.presentationId,
      entry.imageKey,
      entry.kind === "promo" ? entry.promoId : null,
    ],
  );
  if (!r)
    throw new BadRequestException(
      "Elegí una imagen existente de la presentación",
    );
  await cachedImage(entry.imageKey);
}
export async function publishStorefront(body: any) {
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    const [state] = await em.query(
      "SELECT * FROM storefront_state WHERE id=1 FOR UPDATE",
    );
    if (state.draft_revision_id !== body.revision)
      throw new ConflictException("El borrador cambió. Volvé a cargarlo.");
    const [revision] = await em.query(
      "SELECT * FROM storefront_revisions WHERE id=$1",
      [body.revision],
    );
    for (const entry of entries(revision.entries)) {
      if (entry.kind === "promo") {
        const result = await promoProduct(em, entry, false, true);
        if (!result)
          throw new BadRequestException(
            `Revisá componentes, sabores y precio único de ${entry.title}`,
          );
        await validImage(em, entry);
        continue;
      }
      const variants = await products(em, entry);
      if (
        variants.length !== entry.variantIds.length ||
        variants.some(
          (p: any) =>
            p.presentation_id !== entry.presentationId ||
            !storefrontEligible(p) ||
            !p.price ||
            Number(p.price) <= 0,
        )
      )
        throw new BadRequestException(
          `Revisá sabores, stock y precio común de ${entry.title}`,
        );
      await validImage(em, entry);
    }
    const home = homeContent(
      revision.home,
      revision.entries,
      revision.categories,
    );
    await validateHomeMedia(home);
    const [previousPublished] = await em.query(
      "SELECT home FROM storefront_revisions WHERE id=$1",
      [state.published_revision_id],
    );
    await syncHomeUsages(
      em,
      "storefront_published",
      home,
      previousPublished?.home,
    );
    await validateMedia(revision.entries, em);
    await syncMediaUsages(em, "storefront_published", revision.entries);
    await em.query(
      "UPDATE storefront_state SET published_revision_id=$1 WHERE id=1",
      [body.revision],
    );
    return { publishedRevision: body.revision };
  });
}
export async function storefrontCatalog(query: any = {}, preview = false) {
  const [revision] = await db.query(
    `SELECT r.* FROM storefront_state s JOIN storefront_revisions r ON r.id=s.${preview ? "draft" : "published"}_revision_id WHERE s.id=1`,
  );
  if (
    !preview &&
    query.revision &&
    Number(query.revision) !== (revision?.id ?? 0)
  )
    throw new ConflictException("El catálogo cambió. Volvé a cargarlo.");
  const items: StorefrontProduct[] = [];
  const warnings: { presentationId: number | string; message: string }[] = [];
  const issues: { presentationId: number | string; message: string }[] = [];
  for (const entry of (revision?.entries || []) as StorefrontEntry[]) {
    if (entry.kind === "promo") {
      if (preview) {
        const variants = await products(db.manager, {
          variantIds: entry.promoComponents.flatMap((c) => c.variantIds),
        });
        if (
          variants.some((p: any) =>
            p.storefrontAvailability.providers.some((r: any) => r.warning),
          )
        )
          warnings.push({
            presentationId: storefrontEntryId(entry),
            message: `${entry.title}: el catálogo del proveedor es antiguo o el último refresco falló. Se conserva el último catálogo exitoso.`,
          });
      }
      const result = await promoProduct(db.manager, entry, preview);
      if (result)
        items.push({
          ...result,
          categoryIds: entry.categoryIds ?? [],
          brand: publicBrand(revision?.brands, entry.brandId),
        });
      if (preview && !(await promoProduct(db.manager, entry, true, true)))
        issues.push({
          presentationId: storefrontEntryId(entry),
          message: `${entry.title}: revisá componentes, sabores y precio único antes de publicar.`,
        });
      continue;
    }
    const current = await products(db.manager, entry);
    if (
      preview &&
      current.some((p: any) =>
        p.storefrontAvailability.providers.some((r: any) => r.warning),
      )
    )
      warnings.push({
        presentationId: entry.presentationId,
        message: `${entry.title}: el catálogo del proveedor es antiguo o el último refresco falló. Se conserva el último catálogo exitoso.`,
      });
    if (
      preview &&
      (current.length !== entry.variantIds.length ||
        current.some(
          (p: any) =>
            p.presentation_id !== entry.presentationId ||
            !storefrontEligible(p) ||
            !p.price ||
            Number(p.price) <= 0,
        ))
    )
      issues.push({
        presentationId: entry.presentationId,
        message: `${entry.title}: revisá sabores, stock propio y precio común antes de publicar.`,
      });
    const selected = current.filter(
      (p: any) =>
        p.presentation_id === entry.presentationId &&
        storefrontEligible(p) &&
        p.price &&
        Number(p.price) > 0,
    );
    if (!selected.length) continue;
    items.push({
      id: entry.presentationId,
      categoryIds: entry.categoryIds ?? [],
      brand: publicBrand(revision?.brands, entry.brandId),
      title: entry.title,
      description: entry.description,
      price: selected[0].price,
      currency: "ARS",
      imageUrl: entry.imageKey
        ? `/api/${preview ? "images" : "public/storefront/images"}/${entry.imageKey}`
        : null,
      variants: selected.map((p: any) => ({ id: p.id, label: p.name })),
      ...mediaView(entry, selected, preview),
    });
  }
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
  const terms = fold(String(query.q || "").slice(0, 200))
    .split(/\s+/)
    .filter(Boolean);
  const filtered = items.filter(
    (item) =>
      (!query.category || item.categoryIds?.includes(query.category)) &&
      (!query.brand || item.brand?.id === query.brand) &&
      terms.every((term) =>
        fold(
          [
            item.title,
            item.description,
            item.brand?.name || "",
            ...item.variants.map((v) => v.label),
            ...(item.components ?? []).flatMap((c) =>
              c.variants.map((v) => v.label),
            ),
          ].join(" "),
        ).includes(term),
      ),
  );
  if (query.category && (!query.order || query.order === "manual")) {
    const ids =
      revision?.categories?.find(
        (c: StorefrontFacet) => c.id === query.category,
      )?.productIds || [];
    filtered.sort((a, b) => {
      const ai = ids.indexOf(a.id),
        bi = ids.indexOf(b.id);
      return (ai < 0 ? ids.length : ai) - (bi < 0 ? ids.length : bi);
    });
  }
  if (query.order === "price-asc" || query.order === "price-desc")
    filtered.sort(
      (a, b) =>
        new Decimal(a.price).cmp(b.price) *
          (query.order === "price-desc" ? -1 : 1) ||
        String(a.id).localeCompare(String(b.id), "es", { numeric: true }),
    );
  const page = Math.max(1, Math.min(100000, Number(query.page) || 1)),
    pageSize = Math.max(1, Math.min(48, Number(query.pageSize) || 24));
  return {
    items: preview
      ? filtered
      : filtered.slice(
          (Math.floor(page) - 1) * Math.floor(pageSize),
          Math.floor(page) * Math.floor(pageSize),
        ),
    total: filtered.length,
    home: publicHome(revision?.home, items, preview),
    revision: revision?.id ?? 0,
    categories: (revision?.categories ?? []).map((c: StorefrontFacet) => ({
      id: c.id,
      name: c.name,
    })),
    brands: (revision?.brands ?? []).map((b: StorefrontFacet) => ({
      id: b.id,
      name: b.name,
    })),
    page: Math.floor(page),
    pageSize: Math.floor(pageSize),
    ...(preview ? { entries: revision?.entries || [], issues, warnings } : {}),
  };
}
export async function storefrontPresentation(
  id: number,
  em: EntityManager = db.manager,
) {
  // Detail is independent of catalog pagination.
  const [revision] = await em.query(
    "SELECT r.entries,r.categories,r.brands FROM storefront_state s JOIN storefront_revisions r ON r.id=s.published_revision_id WHERE s.id=1",
  );
  const entry = revision?.entries.find(
    (e: StorefrontEntry) => e.kind !== "promo" && e.presentationId === id,
  );
  if (!entry) throw new NotFoundException("Producto no disponible");
  const variants = (await products(em, entry)).filter(
    (p: any) =>
      p.presentation_id === id &&
      storefrontEligible(p) &&
      p.price &&
      Number(p.price) > 0,
  );
  if (!variants.length) throw new NotFoundException("Producto no disponible");
  return {
    id,
    categoryIds: entry.categoryIds ?? [],
    brand: publicBrand(revision?.brands, entry.brandId),
    title: entry.title,
    description: entry.description,
    price: variants[0].price,
    currency: "ARS",
    imageUrl: entry.imageKey
      ? `/api/public/storefront/images/${entry.imageKey}`
      : null,
    variants: variants.map((p: any) => ({ id: p.id, label: p.name })),
    ...mediaView(entry, variants, false),
  };
}
async function promoProduct(
  em: EntityManager,
  entry: Extract<StorefrontEntry, { kind: "promo" }>,
  preview = false,
  strict = false,
): Promise<StorefrontProduct | null> {
  const [promo] = await em.query(
    "SELECT *,selling_price::text,kit_discount_percent::text FROM products WHERE id=$1 AND kind='kit' AND NOT archived",
    [entry.promoId],
  );
  if (!promo) return null;
  const components = await em.query(
    "SELECT * FROM product_components WHERE kit_id=$1 ORDER BY product_id",
    [entry.promoId],
  );
  if (!components.length || components.length !== entry.promoComponents.length)
    return null;
  const result: NonNullable<StorefrontProduct["components"]> = [];
  const prices: { quantity: number; selling_price: string }[] = [];
  for (const component of components) {
    const selection = entry.promoComponents.find(
      (c) => c.componentId === component.product_id,
    );
    if (!selection) return null;
    const all = await products(em, { variantIds: selection.variantIds });
    const valid = (p: any) =>
      p.kind === "product" &&
      (component.variant_group
        ? p.variant_group === component.variant_group
        : p.id === component.product_id) &&
      storefrontEligible(p) &&
      (p.storefrontAvailability.availability !== "order" ||
        promo.price_list_order_allowed) &&
      p.price &&
      Number(p.price) > 0;
    if (
      strict &&
      (all.length !== selection.variantIds.length ||
        all.some((p: any) => !valid(p)))
    )
      return null;
    const eligible = all.filter(valid);
    if (!eligible.length) return null;
    if (
      promo.kit_pricing_mode !== "final" &&
      eligible.some(
        (p: any) => !new Decimal(p.selling_price).eq(eligible[0].price),
      )
    )
      return null;
    prices.push({
      quantity: component.quantity,
      selling_price: eligible[0].price,
    });
    result.push({
      componentId: component.product_id,
      label: component.variant_group || eligible[0].name,
      quantity: component.quantity,
      variants: eligible.map((p: any) => ({ id: p.id, label: p.name })),
    });
  }
  const price =
    promo.kit_pricing_mode === "final"
      ? promo.selling_price
      : kitSellingPrice(prices, promo.kit_discount_percent).selling_price;
  if (!price || !new Decimal(price).isPositive()) return null;
  return {
    id: `promo-${promo.id}`,
    kind: "promo",
    title: entry.title,
    description: entry.description,
    price,
    currency: "ARS",
    imageUrl: entry.imageKey
      ? `/api/${preview ? "images" : "public/storefront/images"}/${entry.imageKey}`
      : null,
    variants: [],
    components: result,
    ...mediaView(entry, [], preview),
  };
}
export async function storefrontPromo(
  id: number,
  em: EntityManager = db.manager,
) {
  const [revision] = await em.query(
    "SELECT r.entries,r.brands FROM storefront_state s JOIN storefront_revisions r ON r.id=s.published_revision_id WHERE s.id=1",
  );
  const entry = revision?.entries.find(
    (e: StorefrontEntry) => e.kind === "promo" && e.promoId === id,
  );
  const result = entry && (await promoProduct(em, entry));
  if (!result) throw new NotFoundException("Promo no disponible");
  return {
    ...result,
    categoryIds: entry.categoryIds ?? [],
    brand: publicBrand(revision?.brands, entry.brandId),
  };
}
export async function storefrontImage(key: string) {
  const [r] = await db.query(
    `SELECT 1 FROM storefront_state s JOIN storefront_revisions r ON r.id=s.published_revision_id WHERE s.id=1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.entries) e WHERE e->>'imageKey'=$1)`,
    [key],
  );
  if (!r) throw new NotFoundException("Imagen no publicada");
  return cachedImage(key);
}

export async function storefrontOrderPermission(id: number, body: any) {
  if (typeof body?.allowed !== "boolean")
    throw new BadRequestException("Permiso inválido");
  const result = await db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    const [p] = await em.query(
      "UPDATE products SET price_list_order_allowed=$2 WHERE id=$1 AND NOT archived RETURNING id,price_list_order_allowed",
      [id, body.allowed],
    );
    if (!p) throw new NotFoundException("Producto no encontrado");
    return p;
  });
  invalidateOrderPolicy();
  return result;
}
function publicBrand(
  brands: StorefrontFacet[] | undefined,
  id: string | null | undefined,
) {
  const b = brands?.find((b) => b.id === id);
  return b ? { id: b.id, name: b.name } : null;
}
export async function storefrontCategories(query: any = {}) {
  const [r] = await db.query(
    "SELECT r.id,r.categories,r.brands FROM storefront_state s JOIN storefront_revisions r ON r.id=s.published_revision_id WHERE s.id=1",
  );
  if (query.revision && Number(query.revision) !== (r?.id ?? 0))
    throw new ConflictException("El catálogo cambió. Volvé a cargarlo.");
  return {
    revision: r?.id ?? 0,
    items: (r?.categories ?? []).map((c: StorefrontFacet) => ({
      id: c.id,
      name: c.name,
    })),
    brands: (r?.brands ?? []).map((b: StorefrontFacet) => ({
      id: b.id,
      name: b.name,
    })),
  };
}
function mediaIds(entry: StorefrontEntry) {
  return [
    ...new Set([
      ...(entry.gallery || []),
      ...(entry.variantImages || []).map((v) => v.mediaId),
    ]),
  ];
}
async function validateMedia(content: StorefrontEntry[], em: EntityManager) {
  for (const id of new Set(content.flatMap(mediaIds))) {
    try {
      await getMediaAsset(id, em);
      await mediaFile(id, "mobile");
      await mediaFile(id, "desktop");
    } catch {
      throw new BadRequestException(
        "Una imagen no está disponible. Elegí otro recurso de biblioteca.",
      );
    }
  }
}
async function syncMediaUsages(
  em: EntityManager,
  ownerType: string,
  content: StorefrontEntry[],
) {
  await em.query(
    "DELETE FROM media_asset_usages WHERE owner_type=$1 AND slot='gallery'",
    [ownerType],
  );
  for (const entry of content)
    await replaceMediaUsages(
      em,
      ownerType,
      String(storefrontEntryId(entry)),
      "gallery",
      mediaIds(entry),
      entry.title,
    );
}
function mediaView(entry: StorefrontEntry, variants: any[], preview: boolean) {
  if (!entry.gallery && !entry.variantImages) return {};
  const url = (id: number, size: string) =>
    preview
      ? `/api/media/${id}/file/${size}`
      : `/api/public/storefront/media/${id}/${size}`;
  const image = (id: number) => ({
    url: url(id, "desktop"),
    srcset: `${url(id, "mobile")} 640w, ${url(id, "desktop")} 1600w`,
  });
  const cover = entry.coverMediaId ?? entry.gallery?.[0];
  const legacy = entry.imageKey
    ? `/api/${preview ? "images" : "public/storefront/images"}/${entry.imageKey}`
    : null;
  const common = cover ? image(cover) : null;
  return {
    gallery: (entry.gallery || []).map(image),
    imageUrl: common?.url ?? legacy,
    imageSrcset: common?.srcset,
    variants: variants.map((p) => {
      const id = entry.variantImages?.find(
        (v) => v.variantId === p.id,
      )?.mediaId;
      const own = id ? image(id) : common;
      return {
        id: p.id,
        label: p.name,
        imageUrl: own?.url ?? legacy,
        imageSrcset: own?.srcset,
      };
    }),
  };
}
export async function storefrontMedia(id: number, size: string) {
  if (!["mobile", "desktop"].includes(size))
    throw new NotFoundException("Versión inexistente");
  const [revision] = await db.query(
    "SELECT r.entries,r.home FROM storefront_state s JOIN storefront_revisions r ON r.id=s.published_revision_id WHERE s.id=1",
  );
  if (
    !(revision?.home?.banners || []).some((b: any) => b.mediaId === id) &&
    !(revision?.entries || []).some((e: StorefrontEntry) =>
      mediaIds(e).includes(id),
    )
  )
    throw new NotFoundException("Imagen no publicada");
  return mediaFile(id, size);
}
