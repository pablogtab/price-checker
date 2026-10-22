import Decimal from "decimal.js";
export const cleanText = (value: any) =>
  String(value ?? "")
    .replace(/[\r\n\t*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const compare = (a: string, b: string) =>
  a.localeCompare(b, "es") || (a < b ? -1 : a > b ? 1 : 0);
export function formatPriceList(title: string, items: any[], now = new Date()) {
  const groups = new Map<string, any>();
  for (const item of items) {
    const name = cleanText(item.variant_group || item.name),
      brand = cleanText(item.brand);
    const price = new Decimal(item.price).toString();
    const key = JSON.stringify([brand, name, price, item.kind === "kit"]);
    if (!groups.has(key))
      groups.set(key, {
        name,
        brand,
        price,
        kit: item.kind === "kit",
        details: item.promo_details,
        available: [],
        order: [],
      });
    const group = groups.get(key);
    const flavor = item.variant_group
      ? cleanText(item.name).startsWith(name)
        ? cleanText(item.name)
            .slice(name.length)
            .replace(/^[ ·—:\-]+/, "") || cleanText(item.name)
        : cleanText(item.name)
      : "";
    group[item.availability === "order" ? "order" : "available"].push(flavor);
  }
  const lines = [...groups.values()]
    .sort(
      (a, b) =>
        Number(a.kit) - Number(b.kit) ||
        Number(!a.brand) - Number(!b.brand) ||
        compare(a.brand, b.brand) ||
        compare(a.name, b.name) ||
        new Decimal(a.price).cmp(b.price),
    )
    .map((g) => {
      const money = new Decimal(g.price)
        .toFixed(2)
        .replace(".", ",")
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const stock = (key: string, label: string) =>
        g[key].length
          ? label +
            (g[key].some(Boolean)
              ? ": " + [...new Set<string>(g[key])].sort(compare).join(", ")
              : "")
          : "";
      return (
        `*${g.name} — $ ${money}*\n` +
        (g.kit
          ? [g.details]
          : [stock("available", "Disponible"), stock("order", "Por encargo")]
        )
          .filter(Boolean)
          .join("\n")
      );
    });
  const date = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
  return lines.length
    ? `*${cleanText(title)}*\n${date}\n\n${lines.join("\n\n")}`
    : "";
}
