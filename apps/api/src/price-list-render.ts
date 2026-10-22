import Decimal from "decimal.js";
export const cleanText = (value: any) =>
  String(value ?? "")
    .replace(/[\r\n\t*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function renderPriceList(
  title: string,
  products: any[],
  now = new Date(),
) {
  const items: any[] = [],
    omissions: any[] = [];
  for (const p of products) {
    let reason = p.missing
      ? "Producto no encontrado"
      : p.archived
        ? "Producto archivado"
        : p.kind === "kit"
          ? "Las promos se incorporarán próximamente"
          : !new Decimal(p.selling_price || 0).isFinite() ||
              !new Decimal(p.selling_price || 0).gt(0)
            ? "Sin precio de venta positivo"
            : !(p.own_stock > 0)
              ? "Sin stock propio"
              : null;
    if (reason) {
      omissions.push({ product_id: p.id, name: p.name, reason });
      continue;
    }
    items.push({
      product_id: p.id,
      name: cleanText(p.name),
      price: new Decimal(p.selling_price).toString(),
      availability: "available",
      brand: cleanText(p.brand),
    });
  }
  items.sort(
    (a, b) =>
      (!a.brand ? 1 : !b.brand ? -1 : a.brand.localeCompare(b.brand, "es")) ||
      a.name.localeCompare(b.name, "es"),
  );
  const date = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
  const lines = items.map(
    (p) =>
      `*${p.name} — $ ${new Decimal(p.price)
        .toFixed(2)
        .replace(".", ",")
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}*\nDisponible`,
  );
  return {
    text: items.length
      ? `*${cleanText(title)}*\n${date}\n\n${lines.join("\n\n")}`
      : "",
    items,
    omissions,
    generated_at: now.toISOString(),
    requires_confirmation: false,
    providers: [],
  };
}
