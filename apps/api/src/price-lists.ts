import { BadRequestException, NotFoundException } from "@nestjs/common";
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
export async function previewPriceList(id: number) {
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
    return renderPriceList(
      list.title,
      list.product_ids.map(
        (id: number) =>
          products.find((p: any) => p.id === id) || { id, missing: true },
      ),
    );
  });
}
