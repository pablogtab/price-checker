import Decimal from "decimal.js";
// Allocate a line discount in cents without losing cents on quantities or flavors.
export function discountItems(items: any[], mode: string, value: any): any[] {
  const amount = new Decimal(value || 0);
  if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2)
    throw new Error("Descuento inválido");
  const total = items.reduce(
    (n, i) => n.plus(new Decimal(i.unit_price).mul(i.quantity)),
    new Decimal(0),
  );
  if (
    (mode === "percent" && amount.gt(100)) ||
    (mode !== "percent" && amount.gt(total))
  )
    throw new Error("El descuento supera el subtotal");
  const target =
    mode === "percent"
      ? total.mul(new Decimal(1).minus(amount.div(100))).toDecimalPlaces(2)
      : total.minus(amount);
  let cumulative = new Decimal(0),
    allocated = new Decimal(0);
  return items.flatMap((i) => {
    cumulative = cumulative.plus(new Decimal(i.unit_price).mul(i.quantity));
    const next = total.eq(0)
      ? new Decimal(0)
      : cumulative.div(total).mul(target).toDecimalPlaces(2);
    const cents = next.minus(allocated).mul(100).toDecimalPlaces(0);
    allocated = next;
    const unit = cents.div(i.quantity).floor(),
      extra = cents.minus(unit.mul(i.quantity)).toNumber();
    return [
      extra
        ? {
            ...i,
            quantity: extra,
            unit_price: unit.plus(1).div(100).toString(),
          }
        : null,
      i.quantity > extra
        ? {
            ...i,
            quantity: i.quantity - extra,
            unit_price: unit.div(100).toString(),
          }
        : null,
    ].filter(Boolean);
  });
}
