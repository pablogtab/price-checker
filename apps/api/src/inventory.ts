import { BadRequestException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { db } from "./db";

const LIMIT = 1_000_000_000;
export function stockQuantity(value: unknown): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^\d+$/.test(String(value))
  )
    throw new BadRequestException(
      "La cantidad debe ser un entero entre 0 y 1.000.000.000",
    );
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > LIMIT)
    throw new BadRequestException("Cantidad de stock inválida");
  return n;
}
export function kitStock(
  parts: { own_stock: number | null; quantity: number }[],
) {
  if (!parts.length || parts.some((p) => p.own_stock == null)) return null;
  return Math.max(
    0,
    Math.min(...parts.map((p) => Math.floor(p.own_stock! / p.quantity))),
  );
}

export async function changeStock(id: number, body: any) {
  const quantity = stockQuantity(body.quantity);
  const type = body.type;
  if (
    !["set", "entry", "exit"].includes(type) ||
    (type !== "set" && quantity === 0)
  )
    throw new BadRequestException(
      "Elegí stock actual, entrada o salida con una cantidad válida",
    );
  if (
    body.note != null &&
    (typeof body.note !== "string" || body.note.length > 500)
  )
    throw new BadRequestException("La nota admite hasta 500 caracteres");
  return db.transaction(async (em) => {
    // Same lock as component edits/deletions: a kit cannot change during its exit.
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    const [product] = await em.query(
      "SELECT * FROM products WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!product) throw new NotFoundException("Producto inexistente");
    if (product.kind === "kit" && type !== "exit")
      throw new BadRequestException(
        "El stock del kit se calcula con sus componentes. Solo podés registrar una salida del kit",
      );
    let rows: any[];
    if (product.archived) throw new BadRequestException("Kit archivado");
    if (product.kind === "kit") {
      const components = await em.query(
        "SELECT * FROM product_components WHERE kit_id=$1 ORDER BY product_id",
        [id],
      );
      if (!components.length)
        throw new BadRequestException("El kit no tiene componentes");
      const selections = body.selections ?? [];
      if (!Array.isArray(selections) || selections.length > 1000)
        throw new BadRequestException("Selección de sabores inválida");
      if (
        selections.some(
          (s: any) =>
            !s ||
            !components.some(
              (c: any) =>
                c.variant_group &&
                c.product_id === Number(s.component_product_id),
            ),
        )
      )
        throw new BadRequestException("Componente de sabor inválido");
      const quantities = new Map<number, number>();
      for (const c of components) {
        if (!c.variant_group) {
          quantities.set(
            c.product_id,
            (quantities.get(c.product_id) || 0) + c.quantity,
          );
          continue;
        }
        const chosen = selections.filter(
          (s: any) => Number(s.component_product_id) === c.product_id,
        );
        let total = 0;
        for (const s of chosen) {
          const amount = stockQuantity(s.quantity),
            variantId = stockQuantity(s.product_id);
          if (!amount)
            throw new BadRequestException(
              "Elegí cantidades positivas por sabor",
            );
          const [variant] = await em.query(
            "SELECT id FROM products WHERE id=$1 AND variant_group=$2 AND kind='product' AND NOT archived",
            [variantId, c.variant_group],
          );
          if (!variant)
            throw new BadRequestException(
              "El sabor no corresponde a la presentación del kit",
            );
          total += amount;
          quantities.set(variantId, (quantities.get(variantId) || 0) + amount);
        }
        if (total !== c.quantity)
          throw new BadRequestException(
            "Elegí los sabores y cantidades de cada componente por kit",
          );
      }
      rows = await em.query(
        "SELECT id,name,own_stock FROM products WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",
        [[...quantities.keys()]],
      );
      rows = rows.map((p: any) => ({ ...p, quantity: quantities.get(p.id) }));
    } else rows = [{ ...product, quantity: 1 }];
    const batch = randomUUID();
    for (const row of rows) {
      if (type !== "set" && row.own_stock == null)
        throw new BadRequestException(
          `Primero cargá el stock actual de ${row.name}`,
        );
      const previous = row.own_stock;
      const delta =
        type === "set"
          ? quantity - (previous ?? 0)
          : quantity * row.quantity * (type === "entry" ? 1 : -1);
      const next = type === "set" ? quantity : previous + delta;
      if (!Number.isSafeInteger(next) || next < 0 || next > LIMIT)
        throw new BadRequestException(
          `Stock insuficiente o cantidad fuera de rango para ${row.name}`,
        );
      await em.query("UPDATE products SET own_stock=$1 WHERE id=$2", [
        next,
        row.id,
      ]);
      await em.query(
        `INSERT INTO stock_movements(batch_id,product_id,product_name,type,quantity,previous_stock,resulting_stock,note,kit_id,kit_name)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          batch,
          row.id,
          row.name,
          type,
          delta,
          previous,
          next,
          body.note?.trim() || null,
          product.kind === "kit" ? id : null,
          product.kind === "kit" ? product.name : null,
        ],
      );
    }
    return { ok: true, batch_id: batch };
  });
}
export async function stockHistory(id: number) {
  const [product] = await db.query("SELECT id FROM products WHERE id=$1", [id]);
  if (!product) throw new NotFoundException("Producto inexistente");
  return db.query(
    "SELECT * FROM stock_movements WHERE product_id=$1 OR kit_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30",
    [id],
  );
}

export async function setRealStock(id: number, value: unknown) {
  const quantity = stockQuantity(value);
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    const [p] = await em.query(
      "SELECT id,kind,archived FROM products WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!p || p.archived) throw new NotFoundException("Producto inexistente");
    if (p.kind === "kit")
      throw new BadRequestException(
        "Corregí el stock de los productos que componen la promo",
      );
    await em.query("UPDATE products SET own_stock=$1 WHERE id=$2", [
      quantity,
      id,
    ]);
    return { id, own_stock: quantity };
  });
}
