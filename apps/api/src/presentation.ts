import { BadRequestException } from "@nestjs/common";

export function packaging(name: string): string | null {
  if (/\b(doy\s*pack|doypack|bolsa|pouch)\b/i.test(name)) return "doypack";
  if (/\b(pote|tarro|jar|frasco)\b/i.test(name)) return "pote";
  return null;
}

export function checkPackaging(product: string, offer: string, confirmed = false) {
  const own = packaging(product), supplier = packaging(offer);
  if (own && supplier && own !== supplier)
    throw new BadRequestException("El envase no coincide: doypack y pote son presentaciones distintas");
  if (own && !supplier && !confirmed)
    throw new BadRequestException("La oferta no indica el envase. Confirmá la presentación antes de vincular");
}
