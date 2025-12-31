import DecimalJs from "decimal.js";
const Decimal = DecimalJs.clone({ precision: 40 });

// Compare supplier-native prices. An FX setting change is not a supplier price change.
export function analyzePrices(previous: any[], snapshot: any) {
  const baseline = previous.length === 0;
  const old = new Map(previous.map((p) => [p.external_id, p]));
  const seen = new Set<string>();
  const changes: any[] = [];
  const summary = {
    baseline,
    compared: 0,
    increased: 0,
    decreased: 0,
    currency_changed: 0,
    unchanged_prices: 0,
    stock_changed: 0,
    added: 0,
    unavailable: 0,
  };
  for (const p of snapshot.products) {
    seen.add(p.id);
    const before = old.get(p.id);
    if (!before?.available) {
      if (!baseline) summary.added++;
      continue;
    }
    summary.compared++;
    if (!new Decimal(before.stock).eq(p.stock)) summary.stock_changed++;
    const currencyChanged = before.currency !== p.price.currency;
    const oldPrice = new Decimal(before.price),
      newPrice = new Decimal(p.price.amount);
    if (!currencyChanged && oldPrice.eq(newPrice)) {
      summary.unchanged_prices++;
      continue;
    }
    const delta = currencyChanged ? null : newPrice.minus(oldPrice);
    const direction = currencyChanged
      ? "currency"
      : delta!.gt(0)
        ? "up"
        : "down";
    if (currencyChanged) summary.currency_changed++;
    else if (direction === "up") summary.increased++;
    else summary.decreased++;
    changes.push({
      external_id: p.id,
      name: p.name,
      internal_code: p.internal_code,
      barcode: p.barcode,
      old_price: oldPrice.toString(),
      new_price: newPrice.toString(),
      old_currency: before.currency,
      new_currency: p.price.currency,
      delta: delta?.toString() ?? null,
      percent:
        delta && !oldPrice.eq(0)
          ? delta.div(oldPrice).mul(100).toString()
          : null,
      direction,
      old_stock: String(before.stock),
      new_stock: p.stock,
    });
  }
  summary.unavailable = previous.filter(
    (p) => p.available && !seen.has(p.external_id),
  ).length;
  changes.sort(
    (a, b) =>
      Math.abs(Number(b.percent ?? 0)) - Math.abs(Number(a.percent ?? 0)) ||
      a.name.localeCompare(b.name),
  );
  return { summary, changes };
}
