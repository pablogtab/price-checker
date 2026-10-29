import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "./db";
import { cartInputs, storefrontCartSnapshot } from "./storefront-cart";
const keyPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function requestKey(key: unknown): string {
  if (typeof key !== "string" || !keyPattern.test(key))
    throw new BadRequestException("Referencia inválida");
  return key;
}
export async function storefrontWhatsapp() {
  const [s] = await db.query(
    "SELECT whatsapp_number FROM storefront_order_settings WHERE id=1",
  );
  return { number: s.whatsapp_number };
}
export async function saveStorefrontWhatsapp(body: any) {
  if (
    typeof body?.number !== "string" ||
    (body.number !== "" && !/^[1-9][0-9]{7,14}$/.test(body.number))
  )
    throw new BadRequestException(
      "Ingresá el número internacional, solo dígitos (8 a 15).",
    );
  await db.query(
    "UPDATE storefront_order_settings SET whatsapp_number=$1 WHERE id=1",
    [body.number],
  );
  return storefrontWhatsapp();
}
function money(value: string) {
  const amount = new Decimal(value);
  const [integer, decimal] = amount
    .toFixed(Math.max(2, amount.decimalPlaces()))
    .split(".");
  return "$ " + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + decimal;
}
function publicReceipt(row: any) {
  const s = row.snapshot;
  return {
    number: s.number,
    status: s.status,
    lines: s.lines,
    total: s.total,
    currency: s.currency,
    message: s.message,
    whatsappUrl: s.whatsappUrl,
    receipt: row.receipt_token,
  };
}
export async function storefrontOrderRequest(key: string) {
  requestKey(key);
  const [row] = await db.query(
    "SELECT snapshot,receipt_token FROM storefront_orders WHERE request_key=$1",
    [key],
  );
  if (!row) throw new NotFoundException();
  return publicReceipt(row);
}
export async function storefrontOrderReceipt(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new NotFoundException();
  const [row] = await db.query(
    "SELECT snapshot,receipt_token FROM storefront_orders WHERE receipt_token=$1",
    [token],
  );
  if (!row) throw new NotFoundException();
  return publicReceipt(row);
}
export async function createStorefrontOrder(body: any) {
  const key = requestKey(body?.requestKey),
    lines = cartInputs(body);
  if (!lines.length) throw new BadRequestException("El carrito está vacío");
  // Identity/composition/quantity only. Never include prices or cached labels in the fingerprint.
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(lines))
    .digest("hex");
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    // Session lock precedes RR snapshot acquisition: a concurrent retry sees the committed winner.
    await runner.query("SELECT pg_advisory_lock(713431,hashtext($1))", [key]);
    await runner.startTransaction("REPEATABLE READ");
    const [existing] = await runner.query(
      "SELECT * FROM storefront_orders WHERE request_key=$1",
      [key],
    );
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new ConflictException(
          "La referencia ya corresponde a otro pedido",
        );
      await runner.commitTransaction();
      return publicReceipt(existing);
    }
    const [settings] = await runner.query(
      "SELECT whatsapp_number FROM storefront_order_settings WHERE id=1",
    );
    if (!settings.whatsapp_number)
      throw new ServiceUnavailableException(
        "WhatsApp no está configurado. Intentá más tarde.",
      );
    const cart = await storefrontCartSnapshot({ lines }, runner.manager);
    if (!cart.lines.length || cart.lines.length !== lines.length)
      throw new BadRequestException("Revisá el carrito antes de continuar");
    const fulfillment = [];
    for (const line of lines) {
      const components =
        line.kind === "promo"
          ? await runner.query(
              'SELECT product_id AS "componentProductId", quantity, variant_group AS "variantGroup" FROM product_components WHERE kit_id=$1 ORDER BY product_id',
              [line.promoId],
            )
          : [];
      fulfillment.push({ ...line, components });
    }
    const [{ id }] = await runner.query(
      "SELECT nextval(pg_get_serial_sequence('storefront_orders','id'))::text id",
    );
    const number = "GEVA-" + id.padStart(6, "0");
    const message = [
      "Pedido " + number,
      ...cart.lines.map(
        (l) =>
          `${l.quantity} × ${l.title}\n${l.labels.join("\n")}\nPrecio unitario: ${money(l.price)} · Subtotal: ${money(l.subtotal)}`,
      ),
      "Total de productos: " + money(cart.total),
      "Entrega y costo de envío a coordinar en Córdoba capital.",
    ].join("\n\n");
    const snapshot = {
      number,
      status: "pending",
      ...cart,
      message,
      whatsappUrl:
        "https://wa.me/" +
        settings.whatsapp_number +
        "?text=" +
        encodeURIComponent(message),
    };
    const receipt = randomBytes(32).toString("hex");
    await runner.query(
      "INSERT INTO storefront_orders(id,request_key,fingerprint,request_payload,receipt_token,snapshot,destination,fulfillment) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        key,
        fingerprint,
        JSON.stringify(lines),
        receipt,
        JSON.stringify(snapshot),
        settings.whatsapp_number,
        JSON.stringify(fulfillment),
      ],
    );
    await runner.commitTransaction();
    return { ...snapshot, receipt };
  } catch (e) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw e;
  } finally {
    try {
      await runner.query("SELECT pg_advisory_unlock(713431,hashtext($1))", [
        key,
      ]);
    } finally {
      await runner.release();
    }
  }
}

const clients = new Map<string, number>();
let windowStart = Date.now(),
  requests = 0;
/** Direct API defense too. Do not trust forwarded IP headers. */
export function guardStorefrontRequest(req: import("express").Request) {
  const now = Date.now();
  if (now - windowStart > 60000) {
    windowStart = now;
    requests = 0;
    clients.clear();
  }
  const ip = req.socket.remoteAddress || "unknown",
    n = (clients.get(ip) || 0) + 1;
  if (clients.size >= 10000 && !clients.has(ip))
    throw new HttpException("Intentá más tarde", 429);
  clients.set(ip, n);
  if (n > 120 || ++requests > 3000)
    throw new HttpException("Intentá más tarde", 429);
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw new HttpException("Se requiere JSON", 415);
  if (Buffer.byteLength(JSON.stringify(req.body) || "") > 65536)
    throw new HttpException("Pedido demasiado grande", 413);
}
