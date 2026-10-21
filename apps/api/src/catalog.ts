import { analyzePrices } from "./price-analysis";
import { db } from "./db";
import { chooseCost, Offer } from "./pricing";
import { BadRequestException } from "@nestjs/common";
import Decimal from "decimal.js";
export function money(value: unknown, positive = false): string {
  if (typeof value !== "string" && typeof value !== "number")
    throw new BadRequestException("Importe inválido");
  try {
    const n = new Decimal(value);
    if (!n.isFinite() || n.lt(0) || (positive && n.eq(0)) || n.abs().gt("1e15"))
      throw 0;
    return n.toString();
  } catch {
    throw new BadRequestException("Importe inválido");
  }
}
export function integer(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new BadRequestException("Identificador inválido");
  return n;
}
export function text(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new BadRequestException("Texto inválido");
  return value.trim();
}
export function optionalText(value: unknown) {
  return value == null || value === "" ? null : text(value);
}
export function validateSnapshot(s: any) {
  if (
    s?.schema_version !== 1 ||
    s.provider !== "Disfit" ||
    !Array.isArray(s.products) ||
    !s.products.length ||
    s.products.length !== s.product_count ||
    !Number.isInteger(s.pages_scraped) ||
    s.pages_scraped < 1 ||
    !Number.isInteger(s.catalog_reported_total) ||
    s.catalog_reported_total < s.product_count ||
    !Number.isFinite(Date.parse(s.scraped_at))
  )
    throw new Error("Snapshot incompleto o inválido");
  const ids = new Set<string>();
  const counts: Record<string, number> = {};
  for (const p of s.products) {
    if (typeof p.id !== "string" || !p.id || ids.has(p.id))
      throw new Error("IDs inválidos o duplicados");
    ids.add(p.id);
    text(p.name);
    if (!["ARS", "USD"].includes(p.price?.currency))
      throw new Error("Moneda inválida");
    money(p.price.amount);
    money(p.price.source_amount);
    if (typeof p.stock !== "string" || !new Decimal(p.stock).isFinite())
      throw new Error("Stock inválido");
    for (const k of ["description", "brand", "category"])
      if (typeof p[k] !== "string")
        throw new Error("Campo de producto inválido");
    for (const k of ["internal_code", "barcode"])
      if (p[k] !== null && typeof p[k] !== "string")
        throw new Error("Código inválido");
    if (typeof p.is_pack !== "boolean" || typeof p.has_variants !== "boolean")
      throw new Error("Indicador inválido");
    if (
      p.last_updated_at_source &&
      !/^\d{2}\/\d{2}\/\d{4}$/.test(p.last_updated_at_source)
    )
      throw new Error("Fecha inválida");
    if (
      p.image_url != null &&
      (typeof p.image_url !== "string" ||
        !/^https:\/\/app\.coverweb\.com\.ar\/imagenes_url\/[A-Za-z0-9_./-]+$/.test(
          p.image_url,
        ) ||
        p.image_url.split("/").includes(".."))
    )
      throw new Error("URL de imagen inválida");
    counts[p.price.currency] = (counts[p.price.currency] || 0) + 1;
  }
  if (Object.keys(counts).some((k) => s.currencies?.[k] !== counts[k]))
    throw new Error("Conteo de monedas inválido");
}
export function linkShape(row: any): any {
  return {
    kit: row.kit,
    individual: row.individual,
    individual_units: row.individual_units,
    kit_units: row.kit_units,
    last_cost: row.last_cost,
    last_currency: row.last_currency,
    last_basis: row.last_basis,
    last_item_id: row.last_item_id,
  };
}
export async function readLinks(q: any = db, productId?: number) {
  return q.query(
    `SELECT l.*,p.name provider_name,row_to_json(k) kit,row_to_json(i) individual FROM product_links l JOIN providers p ON p.id=l.provider_id LEFT JOIN LATERAL (SELECT id,name,available,price::text,currency,stock::text,external_id,brand,category,barcode,internal_code,is_pack,image_path FROM supplier_items WHERE id=l.kit_item_id) k ON true LEFT JOIN LATERAL (SELECT id,name,available,price::text,currency,stock::text,external_id,brand,category,barcode,internal_code,is_pack,image_path FROM supplier_items WHERE id=l.individual_item_id) i ON true ${productId ? "WHERE l.product_id=$1" : ""} ORDER BY l.id`,
    productId ? [productId] : [],
  );
}
export async function rememberCosts(q: any = db) {
  for (const l of await readLinks(q)) {
    const c = chooseCost(linkShape(l));
    if (c && !c.stale)
      await q.query(
        "UPDATE product_links SET last_cost=$1,last_currency=$2,last_basis=$3,last_item_id=$4,last_cost_at=now() WHERE id=$5",
        [c.amount, c.currency, c.basis, c.itemId, l.id],
      );
  }
}
export async function importSnapshot(
  snapshot: any,
  providerId: number,
  runId?: number,
) {
  validateSnapshot(snapshot);
  await db.transaction(async (em) => {
    // Serialize the comparison and catalog replacement for this provider.
    await em.query("SELECT id FROM providers WHERE id=$1 FOR UPDATE", [
      providerId,
    ]);
    const previous = runId
      ? await em.query(
          "SELECT external_id,name,price::text,currency,stock::text,available FROM supplier_items WHERE provider_id=$1",
          [providerId],
        )
      : [];
    const analysis = runId ? analyzePrices(previous, snapshot) : null;
    // Remember the currently selected costs before an offer disappears.
    await rememberCosts(em);
    await em.query(
      "UPDATE supplier_items SET available=false WHERE provider_id=$1",
      [providerId],
    );
    await em.query(
      `INSERT INTO supplier_items(provider_id,external_id,name,description,internal_code,barcode,brand,category,currency,price,source_price,stock,is_pack,has_variants,source_updated_at,seen_at,available,image_url)
  SELECT $1,p->>'id',p->>'name',p->>'description',p->>'internal_code',p->>'barcode',p->>'brand',p->>'category',p->'price'->>'currency',(p->'price'->>'amount')::numeric,(p->'price'->>'source_amount')::numeric,(p->>'stock')::numeric,(p->>'is_pack')::boolean,(p->>'has_variants')::boolean,CASE WHEN p->>'last_updated_at_source' IS NULL THEN NULL ELSE to_date(p->>'last_updated_at_source','DD/MM/YYYY') END,$3::timestamptz,true,p->>'image_url' FROM jsonb_array_elements($2::jsonb) p
  ON CONFLICT(provider_id,external_id) DO UPDATE SET name=excluded.name,description=excluded.description,internal_code=excluded.internal_code,barcode=excluded.barcode,brand=excluded.brand,category=excluded.category,currency=excluded.currency,price=excluded.price,source_price=excluded.source_price,stock=excluded.stock,is_pack=excluded.is_pack,has_variants=excluded.has_variants,source_updated_at=excluded.source_updated_at,seen_at=excluded.seen_at,available=true,image_url=CASE WHEN supplier_items.image_path IS NULL THEN coalesce(excluded.image_url,supplier_items.image_url) ELSE supplier_items.image_url END`,
      [providerId, JSON.stringify(snapshot.products), snapshot.scraped_at],
    );
    await rememberCosts(em);
    await em.query("UPDATE providers SET last_success_at=$1 WHERE id=$2", [
      snapshot.scraped_at,
      providerId,
    ]);
    if (runId)
      await em.query(
        `UPDATE refresh_runs SET status='success',finished_at=now(),product_count=$1,reported_count=$2,pages=$3,warning=$4,price_analysis=$6::jsonb,price_changes=$7::jsonb WHERE id=$5`,
        [
          snapshot.product_count,
          snapshot.catalog_reported_total,
          snapshot.pages_scraped,
          snapshot.catalog_reported_total === snapshot.product_count
            ? null
            : `El proveedor informa ${snapshot.catalog_reported_total} productos; devolvió ${snapshot.product_count}.`,
          runId,
          JSON.stringify(analysis!.summary),
          JSON.stringify(analysis!.changes),
        ],
      );
  });
}
