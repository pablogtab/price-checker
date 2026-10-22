import { BadRequestException } from "@nestjs/common";
import { db } from "./db";
export async function orderPolicy() {
  const [settings] = await db.query(
    "SELECT price_list_order_days days FROM settings WHERE id=1",
  );
  const products = await db.query(
    "SELECT id,name,price_list_order_allowed allowed FROM products WHERE NOT archived ORDER BY name,id",
  );
  return { days: settings?.days ?? 7, products };
}
export async function saveOrderPolicy(body: any) {
  if (
    !Number.isInteger(body.days) ||
    body.days < 1 ||
    body.days > 365 ||
    !Array.isArray(body.allowed_product_ids) ||
    body.allowed_product_ids.some(
      (id: any) => !Number.isSafeInteger(id) || id <= 0,
    )
  )
    throw new BadRequestException("Política de encargos inválida");
  const ids = [...new Set(body.allowed_product_ids)];
  await db.transaction(async (m) => {
    const found = await m.query(
      "SELECT id FROM products WHERE id=ANY($1::int[])",
      [ids],
    );
    if (found.length !== ids.length)
      throw new BadRequestException("Producto inexistente");
    await m.query(
      "INSERT INTO settings(id,price_list_order_days) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET price_list_order_days=$1",
      [body.days],
    );
    await m.query(
      "UPDATE products SET price_list_order_allowed=(id=ANY($1::int[]))",
      [ids],
    );
  });
  return orderPolicy();
}
/** Any current linked offer can support an order; costing selection is irrelevant. */
export function orderAvailability(product: any, offers: any[], now: Date) {
  if (Number(product.own_stock) > 0)
    return { availability: "available", providers: [] };
  if (!product.price_list_order_allowed)
    return {
      omission_reason: "Sin stock propio; encargo no habilitado",
      providers: [],
    };
  const eligible = offers.filter(
    (o) =>
      o.product_id === product.id &&
      o.available &&
      o.stock !== null &&
      Number(o.stock) > 0 &&
      o.last_success_at,
  );
  if (!eligible.length)
    return {
      omission_reason:
        "Sin stock positivo conocido en ofertas vinculadas vigentes",
      providers: [],
    };
  // Prefer a fresh alternative over requiring confirmation for a stale alternative.
  const providers = eligible.map((o) => ({
    id: o.provider_id,
    name: o.provider_name,
    last_success_at: new Date(o.last_success_at).toISOString(),
    warning:
      now.getTime() - new Date(o.last_success_at).getTime() > 86400000 ||
      (["failed", "session_required"].includes(o.latest_status) &&
        new Date(o.latest_at).getTime() >
          new Date(o.last_success_at).getTime()),
  }));
  const chosen = providers.find((p) => !p.warning) ?? providers[0];
  return { availability: "order", providers: [chosen] };
}
