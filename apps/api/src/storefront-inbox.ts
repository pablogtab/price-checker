import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { db } from "./db";
import { integer } from "./catalog";
const fields = "id,status,snapshot,fulfillment,sale_id,created_at";
export async function storefrontInbox(query: any) {
  const page = query.page ? integer(query.page) : 1;
  const status = query.status || "pending";
  if (!["pending", "converted", "discarded", "all"].includes(status))
    throw new BadRequestException("Estado inválido");
  const search = String(query.q || "")
    .trim()
    .slice(0, 100);
  const params = [status, search];
  const where = `WHERE ($1='all' OR status=$1) AND ($2='' OR position(lower($2) in lower(snapshot->>'number'))>0)`;
  const [count] = await db.query(
    `SELECT count(*)::int total FROM storefront_orders ${where}`,
    params,
  );
  const rows = await db.query(
    `SELECT ${fields} FROM storefront_orders ${where} ORDER BY id DESC LIMIT 25 OFFSET $3`,
    [...params, (page - 1) * 25],
  );
  return { rows, total: count.total, page, pageSize: 25 };
}
export async function storefrontInboxOrder(id: number) {
  const [row] = await db.query(
    `SELECT ${fields} FROM storefront_orders WHERE id=$1`,
    [id],
  );
  if (!row) throw new NotFoundException("Pedido inexistente");
  return row;
}
export async function discardStorefrontOrder(id: number) {
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    await em.query("SELECT pg_advisory_xact_lock(713453)");
    const [row] = await em.query(
      "SELECT status FROM storefront_orders WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!row) throw new NotFoundException("Pedido inexistente");
    if (row.status !== "pending")
      throw new ConflictException(
        "Solo se pueden descartar pedidos pendientes",
      );
    await em.query(
      "UPDATE storefront_orders SET status='discarded' WHERE id=$1",
      [id],
    );
    return { id, status: "discarded" };
  });
}
