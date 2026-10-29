import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { db } from "./db";
import { money } from "./catalog";

// Callers serialize catalog mutations with advisory lock 713450.
export async function presentationFor(
  em: EntityManager,
  group: string | null,
  price: string,
) {
  if (group) {
    const [existing] = await em.query(
      "SELECT * FROM presentations WHERE variant_group=$1 FOR UPDATE",
      [group],
    );
    if (existing) return existing;
  }
  const [p] = await em.query(
    "INSERT INTO presentations(variant_group,catalog_price) VALUES($1,$2) RETURNING *",
    [group, price],
  );
  return p;
}
export async function setPresentationPrice(
  em: EntityManager,
  id: number,
  price: string,
) {
  await em.query("UPDATE presentations SET catalog_price=$2 WHERE id=$1", [
    id,
    price,
  ]);
  await em.query(
    "UPDATE products SET selling_price=$2 WHERE presentation_id=$1 AND kind='product'",
    [id, price],
  );
}
export async function presentations() {
  return db.query(
    `SELECT r.*,r.catalog_price::text,coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'selling_price',p.selling_price::text,'archived',p.archived) ORDER BY p.id) FILTER(WHERE p.id IS NOT NULL),'[]') variants FROM presentations r JOIN products p ON p.presentation_id=r.id GROUP BY r.id ORDER BY r.id`,
  );
}
export async function resolvePresentationPrice(id: number, value: unknown) {
  const price = money(value);
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    const [p] = await em.query(
      "SELECT id FROM presentations WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!p) throw new NotFoundException("Presentación inexistente");
    await setPresentationPrice(em, id, price);
    return { id, catalog_price: price };
  });
}
export function pendingPrice() {
  throw new BadRequestException(
    "Resolvé el precio común de la presentación antes de cambiar sus precios",
  );
}
