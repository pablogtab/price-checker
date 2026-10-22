import Decimal from "decimal.js";
import { cleanText, formatPriceList } from "./price-list-format";
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
      availability: p.availability || "available",
      variant_group: cleanText(p.variant_group),
      brand: cleanText(p.brand),
    });
  }
  return {
    text: formatPriceList(title, items, now),
    items,
    omissions,
    generated_at: now.toISOString(),
    requires_confirmation: false,
    providers: [],
  };
}
