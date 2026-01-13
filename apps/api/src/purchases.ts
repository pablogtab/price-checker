import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "./db";
import { integer, money, optionalText } from "./catalog";
import { stockQuantity } from "./inventory";

export async function purchases() {
  const rows = await db.query(
    `SELECT p.*,p.received_on::text, v.name provider_name FROM purchases p JOIN providers v ON v.id=p.provider_id ORDER BY p.received_on DESC,p.id DESC LIMIT 100`,
  );
  if (!rows.length) return rows;
  const items = await db.query(
    `SELECT *,unit_price::text,total::text FROM purchase_items WHERE purchase_id=ANY($1::int[]) ORDER BY id`,
    [rows.map((p: any) => p.id)],
  );
  const payments=await db.query(`SELECT pp.*,pp.amount::text,o.occurred_on::text,o.note,a.name account_name,a.currency account_currency,(-e.amount)::text account_amount FROM purchase_payments pp JOIN cash_operations o ON o.id=pp.operation_id JOIN cash_entries e ON e.operation_id=o.id JOIN cash_accounts a ON a.id=e.account_id WHERE pp.purchase_id=ANY($1::int[]) ORDER BY pp.id`,[rows.map((p:any)=>p.id)]);
  return rows.map((p: any) => ({
    ...p,
    payments: payments.filter((payment:any)=>payment.purchase_id===p.id),
    items: items.filter((i: any) => i.purchase_id === p.id),
  }));
}
export async function receivePurchase(body: any) {
  const provider = integer(body.provider_id);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      body.request_key || "",
    )
  )
    throw new BadRequestException("Identificador de compra inválido");
  const date = String(body.received_on || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new BadRequestException("Fecha inválida");
  const note = optionalText(body.note);
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 100
  )
    throw new BadRequestException("Agregá productos a la compra");
  const items = body.items.map((i: any) => {
    const product_id = integer(i.product_id),
      quantity = stockQuantity(i.quantity),
      unit_price = money(i.unit_price);
    if (!quantity || !["ARS", "USD"].includes(i.currency))
      throw new BadRequestException("Cantidad o moneda inválida");
    return { product_id, quantity, unit_price, currency: i.currency };
  });
  if (new Set(items.map((i: any) => i.product_id)).size !== items.length)
    throw new BadRequestException(
      "Agrupá las cantidades del mismo producto en una fila",
    );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ provider, date, note, items }))
    .digest("hex");
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    const [existing] = await em.query(
      "SELECT id,fingerprint FROM purchases WHERE request_key=$1",
      [body.request_key],
    );
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new ConflictException(
          "Esta compra ya fue registrada con otros datos",
        );
      return { id: existing.id };
    }
    const [vendor] = await em.query("SELECT id FROM providers WHERE id=$1", [
      provider,
    ]);
    if (!vendor) throw new NotFoundException("Proveedor inexistente");
    const rows = await em.query(
      "SELECT * FROM products WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",
      [items.map((i: any) => i.product_id)],
    );
    for (const item of items) {
      const p = rows.find((p: any) => p.id === item.product_id);
      if (!p || p.archived || p.kind === "kit")
        throw new BadRequestException("Elegí productos individuales por sabor");
      const [link] = await em.query(
        "SELECT id FROM product_links WHERE product_id=$1 AND provider_id=$2",
        [p.id, provider],
      );
      if (!link)
        throw new BadRequestException(
          `${p.name}: no está vinculado a este proveedor`,
        );
      if (p.own_stock == null)
        throw new BadRequestException(`${p.name}: cargá primero su stock real`);
      if (p.own_stock + item.quantity > 1000000000)
        throw new BadRequestException("Stock fuera de rango");
    }
    const [purchase] = await em.query(
      "INSERT INTO purchases(provider_id,received_on,note,request_key,fingerprint) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [provider, date, note, body.request_key, fingerprint],
    );
    for (const item of items) {
      const p = rows.find((p: any) => p.id === item.product_id),
        total = new Decimal(item.unit_price).mul(item.quantity).toString();
      await em.query(
        "INSERT INTO purchase_items(purchase_id,product_id,product_name,quantity,unit_price,currency,total,previous_stock,resulting_stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          purchase.id,
          p.id,
          p.name,
          item.quantity,
          item.unit_price,
          item.currency,
          total,
          p.own_stock,
          p.own_stock + item.quantity,
        ],
      );
      await em.query("UPDATE products SET own_stock=own_stock+$1 WHERE id=$2", [
        item.quantity,
        p.id,
      ]);
    }
    return { id: purchase.id };
  });
}

export async function purchaseSummary() {
  const [counts] = await db.query(
    `SELECT count(*)::int total,count(*) FILTER(WHERE received_on >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date-29)::int recent FROM purchases`,
  );
  const totals = await db.query(
    `SELECT i.currency,sum(i.total)::text total,coalesce(sum(i.total) FILTER(WHERE p.received_on >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date-29),0)::text recent_total,sum(i.quantity)::text units FROM purchase_items i JOIN purchases p ON p.id=i.purchase_id GROUP BY i.currency ORDER BY i.currency`,
  );
  return { ...counts, totals };
}
