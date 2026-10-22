import { createHash, randomUUID } from "node:crypto";
import { evaluatePromo } from "./price-list-promos";
import { orderAvailability, orderPolicyRevision } from "./price-list-orders";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { db } from "./db";
import { renderPriceList } from "./price-list-render";
export async function priceLists() {
  return db.query(
    "SELECT id,title,product_ids,updated_at FROM price_lists ORDER BY lower(title),id",
  );
}
export async function priceList(id: number) {
  const [row] = await db.query("SELECT * FROM price_lists WHERE id=$1", [id]);
  const result = Array.isArray(row) ? row[0] : row;
  if (!result) throw new NotFoundException("Lista no encontrada");
  return result;
}
export async function savePriceList(id: number | null, body: any) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 120 || /[\r\n]/.test(title))
    throw new BadRequestException("Ingresá un título de hasta 120 caracteres");
  if (
    !Array.isArray(body.product_ids) ||
    body.product_ids.length > 10000 ||
    body.product_ids.some((x: any) => !Number.isSafeInteger(x) || x <= 0)
  )
    throw new BadRequestException("Selección inválida");
  const ids = [...new Set(body.product_ids)];
  if (id) previews.delete(id);
  return db.transaction(async (manager) => {
    if (ids.length) {
      const rows = await manager.query(
        "SELECT id FROM products WHERE id=ANY($1::int[])",
        [ids],
      );
      if (rows.length !== ids.length)
        throw new BadRequestException(
          "La selección contiene productos inexistentes",
        );
    }
    const [row] = id
      ? await manager.query(
          "UPDATE price_lists SET title=$2,product_ids=$3,updated_at=now() WHERE id=$1 RETURNING *",
          [id, title, ids],
        )
      : await manager.query(
          "INSERT INTO price_lists(title,product_ids) VALUES($1,$2) RETURNING *",
          [title, ids],
        );
    const result = Array.isArray(row) ? row[0] : row;
    if (!result) throw new NotFoundException("Lista no encontrada");
    return result;
  });
}
async function buildPreview(id: number) {
  return db.transaction("REPEATABLE READ", async (manager) => {
    const [list] = await manager.query(
      "SELECT * FROM price_lists WHERE id=$1",
      [id],
    );
    if (!list) throw new NotFoundException("Lista no encontrada");
    const products = await manager.query(
      `SELECT p.*,p.selling_price::text,COALESCE(s.brand,'') brand FROM products p LEFT JOIN LATERAL (SELECT COALESCE(i.brand,k.brand) brand FROM product_links l LEFT JOIN supplier_items i ON i.id=l.individual_item_id LEFT JOIN supplier_items k ON k.id=l.kit_item_id WHERE l.product_id=p.id ORDER BY (l.provider_id=p.preferred_provider_id) DESC NULLS LAST,l.id LIMIT 1) s ON true WHERE p.id=ANY($1::int[])`,
      [list.product_ids],
    );
    const components = await manager.query(
      "SELECT * FROM product_components WHERE kit_id=ANY($1::int[])",
      [list.product_ids],
    );
    const catalog = await manager.query(
      "SELECT *,selling_price::text FROM products WHERE kind='product'",
    );
    const allIds = [...list.product_ids, ...catalog.map((p: any) => p.id)];
    const offers = await manager.query(
      `SELECT s.id item_id,CASE WHEN s.id=l.kit_item_id THEN l.kit_units ELSE l.individual_units END units,l.product_id,s.available,s.stock::text,l.provider_id,p.name provider_name,p.last_success_at,r.status latest_status,r.finished_at latest_at FROM product_links l JOIN providers p ON p.id=l.provider_id JOIN supplier_items s ON (s.id=l.individual_item_id OR s.id=l.kit_item_id) LEFT JOIN LATERAL (SELECT status,finished_at FROM refresh_runs WHERE provider_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true WHERE l.product_id=ANY($1::int[])`,
      [allIds],
    );
    const [settings] = await manager.query(
      "SELECT price_list_order_days FROM settings WHERE id=1",
    );
    const now = new Date();
    const providers = new Map();
    for (const product of products) {
      const result =
        product.kind === "kit"
          ? evaluatePromo(product, components, catalog, offers, now)
          : orderAvailability(product, offers, now);
      Object.assign(product, result);
      for (const provider of result.providers)
        providers.set(provider.id, provider);
    }
    const result = renderPriceList(
      list.title,
      list.product_ids.map(
        (id: number) =>
          products.find((p: any) => p.id === id) || { id, missing: true },
      ),
    );
    const used = new Set(
      result.items
        .filter((p: any) => p.availability === "order")
        .map((p: any) => p.product_id),
    );
    result.providers = [
      ...new Map(
        products
          .filter((p: any) => used.has(p.id))
          .flatMap((p: any) =>
            p.providers.map((provider: any) => [provider.id, provider]),
          ),
      ).values(),
    ] as never[];
    result.requires_confirmation = result.providers.some((p: any) => p.warning);
    if (result.items.some((p: any) => p.availability === "order"))
      result.text += `\n\n📦 Encargos: entrega estimada de ${settings?.price_list_order_days ?? 7} días. Sujeto a disponibilidad del proveedor.`;
    return {
      ...result,
      fingerprint: createHash("sha256")
        .update(
          JSON.stringify([
            orderPolicyRevision,
            list,
            products,
            components,
            catalog,
            offers,
            settings,
          ]),
        )
        .digest("hex"),
    };
  });
}

// Ephemeral, bounded preview acceptance; restart requires regenerating, never business writes.
const previews = new Map<
  number,
  {
    id: string;
    fingerprint: string;
    text: string;
    requires_confirmation: boolean;
    expires: number;
  }
>();
export async function previewPriceList(id: number) {
  previews.delete(id);
  const { fingerprint, ...result } = await buildPreview(id);
  while (previews.size >= 1000) previews.delete(previews.keys().next().value!);
  const preview_id = randomUUID();
  previews.set(id, {
    id: preview_id,
    fingerprint,
    text: result.text,
    requires_confirmation: result.requires_confirmation,
    expires: Date.now() + 30 * 60 * 1000,
  });
  return { ...result, preview_id };
}
export async function confirmPriceList(id: number, body: any) {
  const preview = previews.get(id);
  if (
    !preview ||
    preview.id !== body.preview_id ||
    preview.expires < Date.now()
  )
    throw new ConflictException("La vista previa cambió. Generala nuevamente.");
  if (preview.requires_confirmation && body.accept_stale !== true)
    throw new BadRequestException(
      "Confirmá la inclusión de encargos desactualizados.",
    );
  const current = await buildPreview(id);
  if (
    previews.get(id) !== preview ||
    current.fingerprint !== preview.fingerprint
  )
    throw new ConflictException(
      "Los datos cambiaron. Generá y revisá otra vista previa.",
    );
  return { preview_id: preview.id, text: preview.text };
}
