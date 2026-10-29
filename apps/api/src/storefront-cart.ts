import { BadRequestException, NotFoundException } from "@nestjs/common";
import Decimal from "decimal.js";
import { EntityManager } from "typeorm";
import { db } from "./db";
import { storefrontPresentation, storefrontPromo } from "./storefront";

export type CartIdentity =
  | { kind: "product"; presentationId: number; variantId: number }
  | {
      kind: "promo";
      promoId: number;
      selections: {
        componentId: number;
        unitIndex: number;
        variantId: number;
      }[];
    };
export type CartInput = CartIdentity & { quantity: number };
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
export function cartInputs(body: any): CartInput[] {
  if (!Array.isArray(body?.lines) || body.lines.length > 100)
    throw new BadRequestException("Carrito inválido");
  return body.lines.map((l: any) => {
    if (!positive(l?.quantity) || l.quantity > 1000000)
      throw new BadRequestException("Cantidad inválida");
    if (
      l.kind === "product" &&
      positive(l.presentationId) &&
      positive(l.variantId)
    )
      return {
        kind: "product",
        presentationId: l.presentationId,
        variantId: l.variantId,
        quantity: l.quantity,
      };
    if (
      l.kind === "promo" &&
      positive(l.promoId) &&
      Array.isArray(l.selections) &&
      l.selections.length > 0 &&
      l.selections.length <= 100
    ) {
      const selections = l.selections
        .map((s: any) => {
          if (
            !positive(s?.componentId) ||
            !positive(s.variantId) ||
            !Number.isSafeInteger(s.unitIndex) ||
            s.unitIndex < 0
          )
            throw new BadRequestException("Composición inválida");
          return {
            componentId: s.componentId,
            unitIndex: s.unitIndex,
            variantId: s.variantId,
          };
        })
        .sort(
          (a: any, b: any) =>
            a.componentId - b.componentId || a.unitIndex - b.unitIndex,
        );
      return {
        kind: "promo",
        promoId: l.promoId,
        selections,
        quantity: l.quantity,
      };
    }
    throw new BadRequestException("Línea inválida");
  });
}
/** One read snapshot shares the catalog's live publication/eligibility and pricing rules. */
export async function validateStorefrontCart(body: unknown) {
  return db.transaction("REPEATABLE READ", (em) =>
    storefrontCartSnapshot(body, em),
  );
}
/** Orders must call this in their own transaction, never validate then insert separately. */
export async function storefrontCartSnapshot(body: unknown, em: EntityManager) {
  const requested = cartInputs(body);
  const lines: any[] = [];
  let total = new Decimal(0);
  for (const input of requested) {
    let item: any;
    try {
      item =
        input.kind === "product"
          ? await storefrontPresentation(input.presentationId, em)
          : await storefrontPromo(input.promoId, em);
    } catch (e) {
      if (e instanceof NotFoundException) continue;
      throw e;
    }
    const labels: string[] = [];
    if (input.kind === "product") {
      const variant = item.variants.find((v: any) => v.id === input.variantId);
      if (!variant) continue;
      if (variant.label !== item.title) labels.push(variant.label);
    } else {
      const expected = item.components.reduce(
        (n: number, c: any) => n + c.quantity,
        0,
      );
      if (input.selections.length !== expected) continue;
      const seen = new Set<string>();
      let valid = true;
      for (const s of input.selections) {
        const c = item.components.find(
          (c: any) => c.componentId === s.componentId,
        );
        const v = c?.variants.find((v: any) => v.id === s.variantId);
        const key = s.componentId + ":" + s.unitIndex;
        if (!c || !v || s.unitIndex >= c.quantity || seen.has(key)) {
          valid = false;
          break;
        }
        seen.add(key);
        labels.push(`${c.label} · ${s.unitIndex + 1}: ${v.label}`);
      }
      if (!valid) continue;
    }
    const price = new Decimal(item.price),
      subtotal = price.mul(input.quantity);
    total = total.plus(subtotal);
    lines.push({
      ...input,
      title: item.title,
      labels,
      price: price.toString(),
      subtotal: subtotal.toString(),
      imageUrl: item.imageUrl,
    });
  }
  return { lines, total: total.toString(), currency: "ARS" };
}
