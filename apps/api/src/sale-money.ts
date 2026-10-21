import { BadRequestException } from "@nestjs/common";
import Decimal from "decimal.js";

/** One sale-wide discount. Base units and quantities remain historical facts. */
export function saleDiscount(value: any) {
  if (value != null && (typeof value !== "object" || Array.isArray(value)))
    throw new BadRequestException("Descuento inválido");
  const mode = value?.mode ?? "amount";
  const raw = value?.value ?? "0";
  let amount: Decimal;
  try {
    amount = new Decimal(raw);
  } catch {
    throw new BadRequestException("Descuento inválido");
  }
  if (
    !["amount", "percent"].includes(mode) ||
    !amount.isFinite() ||
    amount.lt(0) ||
    amount.decimalPlaces() > 2 ||
    (mode === "percent" && amount.gt(100))
  )
    throw new BadRequestException(
      "Descuento inválido: usá un importe positivo o porcentaje entre 0 y 100, hasta dos decimales",
    );
  return { mode, value: amount.toString() };
}

export function priceSale<T extends { total: string }>(
  lines: T[],
  discount: ReturnType<typeof saleDiscount>,
) {
  const subtotal = lines.reduce(
    (s, line) => s.plus(line.total),
    new Decimal(0),
  );
  if (subtotal.gt("1e15"))
    throw new BadRequestException("Subtotal fuera de rango");
  const value = new Decimal(discount.value);
  if (discount.mode === "amount" && value.gt(subtotal))
    throw new BadRequestException("El descuento supera el subtotal");
  const discountAmount =
    discount.mode === "percent"
      ? subtotal.mul(value).div(100).toDecimalPlaces(2)
      : value;
  const total = subtotal.minus(discountAmount);
  let cumulative = new Decimal(0),
    allocated = new Decimal(0);
  const items = lines.map((line) => {
    cumulative = cumulative.plus(line.total);
    const next = subtotal.eq(0)
      ? new Decimal(0)
      : cumulative.div(subtotal).mul(discountAmount).toDecimalPlaces(2);
    const amount = next.minus(allocated);
    allocated = next;
    return {
      ...line,
      subtotal: line.total,
      discount_amount: amount.toString(),
      total: new Decimal(line.total).minus(amount).toString(),
    };
  });
  return {
    subtotal: subtotal.toString(),
    discount_mode: discount.mode,
    discount_value: discount.value,
    discount_amount: discountAmount.toString(),
    total: total.toString(),
    items,
  };
}
