import Decimal from "decimal.js";
Decimal.set({ precision: 40 });
export type Offer = {
  id: number;
  available: boolean;
  price: string;
  currency: string;
  stock: string;
  name: string;
  is_pack?: boolean;
};
export type Link = {
  kit?: Offer;
  individual?: Offer;
  individual_units?: number;
  last_cost?: string | null;
  last_currency?: string | null;
  last_basis?: string | null;
  last_item_id?: number | null;
};
export function chooseCost(link: Link) {
  const offer = link.kit?.available
    ? link.kit
    : link.individual?.available
      ? link.individual
      : undefined;
  if (offer)
    return {
      amount: new Decimal(offer.price)
        .div(offer === link.kit ? 7 : link.individual_units || 1)
        .toString(),
      currency: offer.currency,
      basis: offer === link.kit ? "kit" : offer.is_pack ? "pack" : "individual",
      units: offer === link.kit ? 7 : link.individual_units || 1,
      itemId: offer.id,
      stock: offer.stock,
      stale: false,
    };
  return link.last_cost
    ? {
        amount: link.last_cost,
        currency: link.last_currency!,
        basis: link.last_basis!,
        itemId: link.last_item_id!,
        stock: null,
        stale: true,
      }
    : null;
}
export function calculate(
  selling: string,
  cost: ReturnType<typeof chooseCost>,
  rate: string | null,
) {
  if (!cost) return { costArs: null, profit: null, margin: null };
  if (cost.currency === "USD" && !rate)
    return { costArs: null, profit: null, margin: null };
  const amount = new Decimal(cost.amount).mul(
      cost.currency === "USD" ? rate! : 1,
    ),
    sale = new Decimal(selling),
    profit = sale.minus(amount);
  return {
    costArs: amount.toString(),
    profit: profit.toString(),
    margin: sale.isZero() ? null : profit.div(sale).mul(100).toString(),
  };
}
