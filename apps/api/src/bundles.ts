import Decimal from "decimal.js";
import { BadRequestException } from "@nestjs/common";
import { integer, money } from "./catalog";
import { calculate } from "./pricing";
export function kitDiscount(value: unknown): string {
  let discount: Decimal;
  try {
    discount = new Decimal(String(value ?? "0"));
  } catch {
    throw new BadRequestException("Descuento inválido");
  }
  if (
    !discount.isFinite() ||
    discount.lt(0) ||
    discount.gt(100) ||
    discount.decimalPlaces() > 8
  )
    throw new BadRequestException(
      "El descuento debe estar entre 0 y 100, con hasta 8 decimales",
    );
  return discount.toString();
}
export function kitSellingPrice(
  components: { quantity: number; selling_price: string }[],
  discount: string,
) {
  const base = components.reduce(
    (total, c) => total.plus(new Decimal(c.selling_price).mul(c.quantity)),
    new Decimal(0),
  );
  const discounted = base.mul(
    new Decimal(1).minus(new Decimal(kitDiscount(discount)).div(100)),
  );
  return {
    kit_base_price: base.toString(),
    selling_price: discounted
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .mul(100)
      .toString(),
  };
}
export async function saveKitPricing(
  q: any,
  id: number,
  discount: unknown,
  mode = "discount",
  finalPrice?: unknown,
) {
  if (!["final", "discount"].includes(mode))
    throw new BadRequestException("Modo de precio inválido");
  const value = kitDiscount(discount);
  const components = await q.query(
    "SELECT c.quantity,(CASE WHEN c.variant_group IS NULL THEN p.selling_price ELSE (SELECT min(v.selling_price) FROM products v WHERE v.variant_group=c.variant_group AND NOT v.archived AND v.kind='product') END)::text selling_price FROM product_components c JOIN products p ON p.id=c.product_id WHERE c.kit_id=$1",
    [id],
  );
  const price = kitSellingPrice(components, value);
  if (mode === "final")
    price.selling_price = new Decimal(money(finalPrice))
      .div(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .mul(100)
      .toString();
  await q.query(
    "UPDATE products SET kit_discount_percent=$1,selling_price=$2,kit_pricing_mode=$4 WHERE id=$3",
    [value, price.selling_price, id, mode],
  );
  const [product] = await q.query(
    "SELECT *,selling_price::text,kit_discount_percent::text FROM products WHERE id=$1",
    [id],
  );
  return { ...product, ...price };
}
export async function saveComponents(q: any, kitId: number, input: any) {
  if (!Array.isArray(input) || !input.length || input.length > 100)
    throw new BadRequestException("Elegí al menos un componente");
  const seen = new Set<string>();
  const normalized: any[] = [];
  for (const c of input) {
    const group =
      c.variant_group == null || c.variant_group === ""
        ? null
        : String(c.variant_group);
    if (group && group.length > 500)
      throw new BadRequestException("Presentación inválida");
    const members = group
      ? await q.query(
          "SELECT id,kind FROM products WHERE variant_group=$1 AND NOT archived ORDER BY id",
          [group],
        )
      : await q.query(
          "SELECT id,kind FROM products WHERE id=$1 AND NOT archived",
          [integer(c.product_id)],
        );
    const id = members[0]?.id,
      quantity = integer(c.quantity);
    const key = group ? "g:" + group : "p:" + id;
    if (members.some((p: any) => p.kind !== "product"))
      throw new BadRequestException(
        "Elegí productos individuales como componentes",
      );
    if (
      !id ||
      id === kitId ||
      members.some((p: any) => p.kind !== "product") ||
      seen.has(key) ||
      quantity > 1000
    )
      throw new BadRequestException("Componentes o cantidades inválidos");
    // Prevent overlap between a fixed flavor and its whole presentation.
    if (
      normalized.some((n: any) =>
        n.members.some((x: any) => members.some((m: any) => m.id === x.id)),
      )
    )
      throw new BadRequestException(
        "No repitas una presentación y uno de sus sabores",
      );
    seen.add(key);
    normalized.push({ id, quantity, group, members });
  }
  await q.query("DELETE FROM product_components WHERE kit_id=$1", [kitId]);
  for (const c of normalized)
    await q.query(
      "INSERT INTO product_components(kit_id,product_id,quantity,variant_group) VALUES($1,$2,$3,$4)",
      [kitId, c.id, c.quantity, c.group],
    );
}
export function assembledPrice(selling: string, components: any[]) {
  const missing =
    !components.length || components.some((c) => c.costArs == null);
  const stale = components.some((c) => c.stale);
  const amount = missing
    ? null
    : components
        .reduce(
          (sum, c) => sum.plus(new Decimal(c.costArs).mul(c.quantity)),
          new Decimal(0),
        )
        .toString();
  const synthetic =
    amount == null
      ? null
      : {
          amount,
          currency: "ARS",
          basis: "assembled",
          itemId: 0,
          stock: null,
          stale,
        };
  return {
    provider_name: "Kit propio",
    cost: synthetic,
    ...calculate(selling, synthetic, null),
    missing_components: missing,
  };
}

export function assembledProfitRange(
  minSale: string,
  maxSale: string,
  parts: any[],
) {
  const low = assembledPrice(
    minSale,
    parts.map((c) => ({ ...c, costArs: c.costArsMax })),
  );
  const high = assembledPrice(maxSale, parts);
  return {
    profit: low.profit,
    profit_max: high.profit,
    margin: low.margin,
    margin_max: low.margin == null ? null : high.margin,
  };
}
