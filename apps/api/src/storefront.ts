import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import Decimal from "decimal.js";
import { EntityManager } from "typeorm";
import { db } from "./db";
import { cachedImage } from "./images";
export interface StorefrontEntry {
  categoryIds?: string[];
  brandId?: string | null;
  presentationId: number;
  title: string;
  description: string;
  imageKey: string | null;
  variantIds: number[];
}
export interface StorefrontProduct {
  categoryIds?: string[];
  brand?: StorefrontFacet | null;
  id: number;
  title: string;
  description: string;
  price: string;
  currency: "ARS";
  imageUrl: string | null;
  variants: { id: number; label: string }[];
}
export async function storefrontDraft() {
  const [r] = await db.query(
    'SELECT r.id revision,r.entries,r.categories,r.brands,s.published_revision_id "publishedRevision" FROM storefront_state s JOIN storefront_revisions r ON r.id=s.draft_revision_id WHERE s.id=1',
  );
  return r;
}
function entries(value: unknown): StorefrontEntry[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new BadRequestException("Selección inválida");
  const seen = new Set<number>();
  return value.map((x) => {
    if (
      !x ||
      !Number.isSafeInteger(x.presentationId) ||
      x.presentationId < 1 ||
      seen.has(x.presentationId) ||
      typeof x.title !== "string" ||
      !x.title.trim() ||
      x.title.length > 180 ||
      typeof x.description !== "string" ||
      x.description.length > 10000 ||
      !Array.isArray(x.variantIds) ||
      !x.variantIds.length ||
      x.variantIds.some(
        (id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1,
      ) ||
      new Set(x.variantIds).size !== x.variantIds.length ||
      (x.imageKey !== null && !/^[a-f0-9]{64}$/.test(x.imageKey))
    )
      throw new BadRequestException("Revisá título, sabores e imagen");
    seen.add(x.presentationId);
    return {
      presentationId: x.presentationId,
      title: x.title.trim(),
      description: x.description.trim(),
      imageKey: x.imageKey,
      variantIds: x.variantIds,
      categoryIds: x.categoryIds ?? [],
      brandId: x.brandId ?? null,
    };
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
      "SELECT categories,brands FROM storefront_revisions WHERE id=$1",
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
    const [r] = await em.query(
      "INSERT INTO storefront_revisions(entries,categories,brands) VALUES($1::jsonb,$2::jsonb,$3::jsonb) RETURNING id",
      [
        JSON.stringify(content),
        JSON.stringify(categories),
        JSON.stringify(brands),
      ],
    );
    await em.query(
      "UPDATE storefront_state SET draft_revision_id=$1 WHERE id=1",
      [r.id],
    );
    return {
      revision: r.id,
      entries: content,
      categories,
      brands,
      publishedRevision: state.published_revision_id,
    };
  });
}
// One eligibility seam: supplier fulfillment is added here by its own ticket.
export function storefrontEligible(p: any) {
  return !p.archived && p.kind === "product" && Number(p.own_stock) > 0;
}
async function products(em: EntityManager, entry: StorefrontEntry) {
  return em.query(
    "SELECT p.id,p.name,p.presentation_id,p.archived,p.kind,p.own_stock,r.catalog_price::text price FROM products p JOIN presentations r ON r.id=p.presentation_id WHERE p.id=ANY($1::int[]) ORDER BY p.id",
    [entry.variantIds],
  );
}
async function validImage(em: EntityManager, entry: StorefrontEntry) {
  if (!entry.imageKey) return;
  const [r] = await em.query(
    `SELECT 1 FROM products p WHERE p.presentation_id=$1 AND (p.custom_image_path=$2 OR EXISTS(SELECT 1 FROM product_links l JOIN supplier_items s ON s.id=l.individual_item_id OR s.id=l.kit_item_id WHERE l.product_id=p.id AND s.image_path=$2)) LIMIT 1`,
    [entry.presentationId, entry.imageKey],
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
  const issues: { presentationId: number; message: string }[] = [];
  for (const entry of (revision?.entries || []) as StorefrontEntry[]) {
    const current = await products(db.manager, entry);
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
          (query.order === "price-desc" ? -1 : 1) || a.id - b.id,
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
    ...(preview ? { entries: revision?.entries || [], issues } : {}),
  };
}
export async function storefrontPresentation(id: number) {
  // Detail is independent of catalog pagination.
  const [revision] = await db.query(
    "SELECT r.entries,r.categories,r.brands FROM storefront_state s JOIN storefront_revisions r ON r.id=s.published_revision_id WHERE s.id=1",
  );
  const entry = revision?.entries.find(
    (e: StorefrontEntry) => e.presentationId === id,
  );
  if (!entry) throw new NotFoundException("Producto no disponible");
  const variants = (await products(db.manager, entry)).filter(
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
