import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { db } from "./db";
import {
  integer,
  text,
  optionalText,
  money,
  readLinks,
  rememberCosts,
  linkShape,
} from "./catalog";
import {
  saveComponents,
  assembledPrice,
  assembledProfitRange,
  kitSellingPrice,
  saveKitPricing,
} from "./bundles";
import { calculate, chooseCost } from "./pricing";
import { checkPackaging } from "./presentation";
import Decimal from "decimal.js";
import { kitStock } from "./inventory";

@Injectable()
export class AppService {
  async health() {
    await db.query("SELECT 1");
    return { ok: true };
  }
  async settings() {
    const [s] = await db.query("SELECT usd_ars::text FROM settings WHERE id=1");
    return s;
  }
  async saveSettings(body: any) {
    const rate =
      body.usd_ars == null || body.usd_ars === ""
        ? null
        : money(body.usd_ars, true);
    await db.query("UPDATE settings SET usd_ars=$1 WHERE id=1", [rate]);
    return this.settings();
  }
  async facets() {
    return {
      providers: await db.query("SELECT * FROM providers ORDER BY name"),
      brands: (
        await db.query(
          "SELECT DISTINCT brand FROM supplier_items WHERE available ORDER BY brand",
        )
      ).map((r: any) => r.brand),
      categories: (
        await db.query(
          "SELECT DISTINCT category FROM supplier_items WHERE available ORDER BY category",
        )
      ).map((r: any) => r.category),
    };
  }
  async catalog(query: any) {
    const args: any[] = [];
    const where = ["s.available"];
    const add = (expr: string, v: any) => {
      args.push(v);
      where.push(expr.replace("?", `$${args.length}`));
    };
    if (query.search)
      for (const term of String(query.search)
        .slice(0, 200)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 12)) {
        add(
          "concat_ws(' ',s.name,s.internal_code,s.barcode) ILIKE ?",
          `%${term.replace(/[\\%_]/g, "\\$&")}%`,
        );
      }
    const values = (key: string): string[] => {
      const input = query[key];
      if (input == null || input === "") return [];
      const list = Array.isArray(input) ? input : [input];
      if (
        list.length > 100 ||
        list.some((v) => !["string", "number"].includes(typeof v))
      )
        throw new BadRequestException("Selección de filtros inválida");
      return [...new Set(list.map(String).filter(Boolean))];
    };
    const providers = values("provider").map(integer);
    if (providers.length) add("s.provider_id=ANY(?::int[])", providers);
    for (const key of ["brand", "category"]) {
      const selected = values(key);
      if (selected.length) add(`s.${key}=ANY(?::text[])`, selected);
    }
    const currencies = values("currency");
    if (currencies.some((v) => !["ARS", "USD"].includes(v)))
      throw new BadRequestException("Moneda inválida");
    if (currencies.length) add("s.currency=ANY(?::text[])", currencies);
    const stock = values("stock"),
      linked = values("linked");
    if (
      stock.some((v) => !["in", "out"].includes(v)) ||
      linked.some((v) => !["yes", "no"].includes(v))
    )
      throw new BadRequestException("Selección de filtros inválida");
    if (stock.length)
      where.push(
        `(${stock.map((v) => (v === "in" ? "s.stock>0" : "s.stock<=0")).join(" OR ")})`,
      );
    if (linked.length === 1 && linked[0] === "yes")
      where.push(
        "EXISTS(SELECT 1 FROM product_links l WHERE l.individual_item_id=s.id OR l.kit_item_id=s.id)",
      );
    if (linked.length === 1 && linked[0] === "no")
      where.push(
        "NOT EXISTS(SELECT 1 FROM product_links l WHERE l.individual_item_id=s.id OR l.kit_item_id=s.id)",
      );
    if (query.kind === "kit")
      where.push("s.is_pack AND s.name ~* '\\mx[[:space:]]*7\\M'");
    if (query.kind === "pack")
      where.push("s.is_pack AND s.name !~* '\\mx[[:space:]]*7\\M'");
    if (query.kind === "individual") where.push("NOT s.is_pack");
    const orders: Record<string, string> = {
      name: "s.name",
      price: "s.currency,s.price",
      stock: "s.stock",
      brand: "s.brand,s.name",
    };
    const order = orders[query.sort] || orders.name;
    const dir = query.direction === "desc" ? "DESC" : "ASC";
    const page = query.page ? integer(query.page) : 1;
    const size = query.size ? Math.min(100, integer(query.size)) : 30;
    const [count] = await db.query(
      `SELECT count(*)::int total FROM supplier_items s WHERE ${where.join(" AND ")}`,
      args,
    );
    const items = await db.query(
      `SELECT s.*,s.price::text,s.stock::text,s.source_price::text,p.name provider_name,EXISTS(SELECT 1 FROM product_links l WHERE l.individual_item_id=s.id OR l.kit_item_id=s.id) linked FROM supplier_items s JOIN providers p ON p.id=s.provider_id WHERE ${where.join(" AND ")} ORDER BY ${order
        .split(",")
        .map((column) => `${column} ${dir}`)
        .join(",")},s.id LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, size, (page - 1) * size],
    );
    return { items, total: count.total, page, size };
  }
  async products() {
    const [settings, products, links] = await Promise.all([
      this.settings(),
      db.query(
        "SELECT *,selling_price::text FROM products WHERE NOT archived ORDER BY position,id",
      ),
      readLinks(),
    ]);
    const result = products.map((p: any) => {
      const offers = links
        .filter((l: any) => l.product_id === p.id)
        .map((l: any) => {
          const cost = chooseCost(linkShape(l));
          return {
            ...l,
            cost,
            ...calculate(p.selling_price, cost, settings.usd_ars),
          };
        });
      return {
        ...p,
        image_path:
          offers
            .map((l: any) => l.individual?.image_path || l.kit?.image_path)
            .find(Boolean) || null,
        offers,
        selected:
          offers.find((l: any) => l.provider_id === p.preferred_provider_id) ||
          offers[0] ||
          null,
      };
    });
    const components = await db.query(
      "SELECT kit_id,product_id,quantity,variant_group FROM product_components ORDER BY product_id",
    );
    return result.map((p: any) => {
      if (p.kind !== "kit") return { ...p, components: [] };
      const parts = components
        .filter((c: any) => c.kit_id === p.id)
        .map((c: any) => {
          const child = result.find((x: any) => x.id === c.product_id);
          const variants = c.variant_group
            ? result.filter(
                (x: any) =>
                  x.kind !== "kit" && x.variant_group === c.variant_group,
              )
            : [child];
          const sales = variants.map((x: any) => new Decimal(x.selling_price));
          const costs = variants.map((x: any) => x.selected?.costArs);
          const costKnown = costs.every((x: any) => x != null);
          return {
            ...c,
            name: c.variant_group || child.name,
            image_path: child.image_path,
            variants: c.variant_group
              ? variants.map((x: any) => ({
                  id: x.id,
                  name: x.name,
                  own_stock: x.own_stock,
                  selling_price: x.selling_price,
                  costArs: x.selected?.costArs ?? null,
                }))
              : [],
            selling_price: Decimal.min(...sales).toString(),
            selling_price_max: Decimal.max(...sales).toString(),
            own_stock: variants.some((x: any) => x.own_stock == null)
              ? null
              : variants.reduce(
                  (sum: number, x: any) => sum + Math.max(0, x.own_stock),
                  0,
                ),
            offers: variants.flatMap((x: any) => x.offers),
            costArs: costKnown ? Decimal.min(...costs).toString() : null,
            costArsMax: costKnown ? Decimal.max(...costs).toString() : null,
            stale: variants.some((x: any) => x.selected?.cost?.stale),
            cost_basis: child.selected?.cost?.basis ?? null,
            provider_name: child.selected?.provider_name ?? null,
          };
        });
      const sale = kitSellingPrice(parts, p.kit_discount_percent);
      const maxSale = kitSellingPrice(
        parts.map((c: any) => ({ ...c, selling_price: c.selling_price_max })),
        p.kit_discount_percent,
      );
      if (p.kit_pricing_mode === "final") {
        sale.selling_price = p.selling_price;
        maxSale.selling_price = p.selling_price;
      }
      const selected = assembledPrice(sale.selling_price, parts);
      const maxCost = assembledPrice(
        maxSale.selling_price,
        parts.map((c: any) => ({ ...c, costArs: c.costArsMax })),
      );
      const profitRange = assembledProfitRange(
        sale.selling_price,
        maxSale.selling_price,
        parts,
      );
      const varies =
        sale.selling_price !== maxSale.selling_price ||
        selected.costArs !== maxCost.costArs;
      return {
        ...p,
        ...sale,
        selling_price_max: maxSale.selling_price,
        cost_ars_max: maxCost.costArs,
        own_stock: kitStock(parts),
        components: parts,
        selected: {
          ...selected,
          ...profitRange,
          profit_range_estimated:
            varies && selected.costArs !== maxCost.costArs,
        },
      };
    });
  }
  async createProduct(body: any) {
    const name = text(body.name);
    const kind = body.kind ?? "product";
    const price = kind === "kit" ? "0" : money(body.selling_price ?? "0");
    if (
      !["product", "kit"].includes(kind) ||
      (kind === "kit" && body.source_item_id)
    )
      throw new BadRequestException("Tipo de producto inválido");
    return db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      let source: any = null;
      if (body.source_item_id) {
        [source] = await em.query("SELECT * FROM supplier_items WHERE id=$1", [
          integer(body.source_item_id),
        ]);
        if (!source || !source.available)
          throw new BadRequestException("Oferta inexistente");
        checkPackaging(name, source.name, body.presentation_confirmed === true);
        if (source.is_pack && !/\bx\s*7\b/i.test(source.name))
          throw new BadRequestException("Solo se admiten unidades o kits x7");
      }
      const [p] = await em.query(
        "INSERT INTO products(name,code,barcode,selling_price,position,preferred_provider_id,kind,variant_group) SELECT $1,$2,$3,$4,coalesce(max(position),-1)+1,$5,$6,$7 FROM products RETURNING *",
        [
          name,
          optionalText(body.code),
          optionalText(body.barcode),
          price,
          source?.provider_id || null,
          kind,
          kind === "kit" ? null : optionalText(body.variant_group),
        ],
      );
      if (source) {
        await em.query(
          "INSERT INTO product_links(product_id,provider_id,individual_item_id,kit_item_id) VALUES($1,$2,$3,$4)",
          [
            p.id,
            source.provider_id,
            source.is_pack ? null : source.id,
            source.is_pack ? source.id : null,
          ],
        );
        await rememberCosts(em);
      }
      if (kind === "kit") {
        await saveComponents(em, p.id, body.components);
        return saveKitPricing(
          em,
          p.id,
          body.kit_discount_percent,
          body.kit_pricing_mode ??
            (body.kit_discount_percent === undefined ? "final" : "discount"),
          body.selling_price ?? "0",
        );
      }
      return p;
    });
  }
  async editKitPricing(id: number, body: any) {
    if (!["final", "discount"].includes(body.kit_pricing_mode))
      throw new BadRequestException("Modo de precio inválido");
    if (
      body.kit_pricing_mode === "final" &&
      (body.selling_price == null || body.selling_price === "")
    )
      throw new BadRequestException("Importe inválido");
    return db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      const [p] = await em.query(
        "SELECT * FROM products WHERE id=$1 AND NOT archived FOR UPDATE",
        [id],
      );
      if (!p) throw new NotFoundException("Producto inexistente");
      if (p.kind !== "kit")
        throw new BadRequestException(
          "El precio de promo corresponde a un kit",
        );
      if (
        body.kit_pricing_mode === "discount" &&
        (body.kit_discount_percent == null || body.kit_discount_percent === "")
      )
        throw new BadRequestException("Descuento inválido");
      return saveKitPricing(
        em,
        id,
        body.kit_pricing_mode === "discount"
          ? body.kit_discount_percent
          : p.kit_discount_percent,
        body.kit_pricing_mode,
        body.selling_price,
      );
    });
  }
  async editKitDiscount(id: number, value: unknown) {
    return db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      const [product] = await em.query(
        "SELECT kind FROM products WHERE id=$1 AND NOT archived FOR UPDATE",
        [id],
      );
      if (!product) throw new NotFoundException("Producto inexistente");
      if (product.kind !== "kit")
        throw new BadRequestException("El descuento corresponde a un kit");
      if (value == null || value === "")
        throw new BadRequestException("Descuento inválido");
      return saveKitPricing(em, id, value);
    });
  }
  async editSellingPrice(id: number, value: unknown) {
    const price = money(value);
    return db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      const [product] = await em.query(
        "SELECT kind FROM products WHERE id=$1 AND NOT archived FOR UPDATE",
        [id],
      );
      if (!product) throw new NotFoundException("Producto inexistente");
      if (product.kind === "kit")
        throw new BadRequestException(
          "El precio del kit se calcula con su descuento y componentes",
        );
      await em.query("UPDATE products SET selling_price=$1 WHERE id=$2", [
        price,
        id,
      ]);
      return { id, selling_price: price };
    });
  }
  async editProduct(id: number, body: any) {
    return db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      const [old] = await em.query(
        "SELECT * FROM products WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!old) throw new NotFoundException("Producto inexistente");
      const preferred =
        old.kind === "kit" || body.preferred_provider_id == null
          ? null
          : integer(body.preferred_provider_id);
      if (preferred) {
        const [l] = await em.query(
          "SELECT id FROM product_links WHERE product_id=$1 AND provider_id=$2",
          [id, preferred],
        );
        if (!l) throw new BadRequestException("Proveedor sin vínculo");
      }
      const group =
        body.variant_group === undefined
          ? old.variant_group
          : optionalText(body.variant_group);
      if (
        old.kind !== "kit" &&
        group !== old.variant_group &&
        old.variant_group
      ) {
        const [used] = await em.query(
          "SELECT 1 FROM product_components c JOIN products p ON p.id=c.kit_id WHERE c.variant_group=$1 AND NOT p.archived LIMIT 1",
          [old.variant_group],
        );
        if (used)
          throw new BadRequestException(
            "Quitá esta presentación de sus kits antes de cambiarla",
          );
      }
      if (old.kind === "kit") await saveComponents(em, id, body.components);
      const [p] = await em.query(
        "UPDATE products SET name=$1,code=$2,barcode=$3,selling_price=$4,preferred_provider_id=$5,variant_group=$7 WHERE id=$6 RETURNING *",
        [
          text(body.name),
          optionalText(body.code),
          optionalText(body.barcode),
          old.kind === "kit" ? old.selling_price : money(body.selling_price),
          preferred,
          id,
          old.kind === "kit" ? null : group,
        ],
      );
      if (old.kind === "kit")
        return saveKitPricing(
          em,
          id,
          body.kit_discount_percent ?? old.kit_discount_percent,
          body.kit_pricing_mode ?? old.kit_pricing_mode,
          body.selling_price ?? old.selling_price,
        );
      return p;
    });
  }
  async deleteProduct(id: number) {
    return db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      const [used] = await em.query(
        "SELECT p.name FROM product_components c JOIN products p ON p.id=c.kit_id WHERE NOT p.archived AND (c.product_id=$1 OR c.variant_group=(SELECT variant_group FROM products WHERE id=$1)) LIMIT 1",
        [id],
      );
      if (used)
        throw new BadRequestException(
          "Este producto forma parte de un kit. Quitalo del kit antes de eliminarlo.",
        );
      const [purchased] = await em.query(
        "SELECT 1 FROM purchase_items WHERE product_id=$1 LIMIT 1",
        [id],
      );
      if (purchased)
        await em.query("UPDATE products SET archived=true WHERE id=$1", [id]);
      else await em.query("DELETE FROM products WHERE id=$1", [id]);
      return { ok: true };
    });
  }
  async order(body: any) {
    if (!Array.isArray(body.ids) || new Set(body.ids).size !== body.ids.length)
      throw new BadRequestException("Orden inválido");
    const ids = body.ids.map(integer);
    await db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      const all = await em.query("SELECT id FROM products FOR UPDATE");
      if (
        all.length !== ids.length ||
        all.some((p: any) => !ids.includes(p.id))
      )
        throw new BadRequestException(
          "La lista cambió; recargá e intentá nuevamente",
        );
      for (let n = 0; n < ids.length; n++)
        await em.query("UPDATE products SET position=$1 WHERE id=$2", [
          n,
          ids[n],
        ]);
    });
    return { ok: true };
  }
  async saveLink(productId: number, body: any) {
    const providerId = integer(body.provider_id);
    const individual =
        body.individual_item_id == null
          ? null
          : integer(body.individual_item_id),
      kit = body.kit_item_id == null ? null : integer(body.kit_item_id);
    const individualUnits =
      body.individual_units == null ? 1 : integer(body.individual_units);
    if (individualUnits > 10000)
      throw new BadRequestException("Cantidad por oferta inválida");
    if (!individual && !kit)
      throw new BadRequestException("Seleccioná una oferta");
    if (individual && individual === kit)
      throw new BadRequestException("El kit y la unidad deben ser distintos");
    if (individual && kit && body.matches_confirmed !== true)
      throw new BadRequestException(
        "Confirmá que la unidad y el kit coinciden en producto, presentación y sabor",
      );
    await db.transaction(async (em) => {
      const [p] = await em.query(
        "SELECT * FROM products WHERE id=$1 FOR UPDATE",
        [productId],
      );
      if (!p) throw new NotFoundException("Producto inexistente");
      if (p.kind === "kit")
        throw new BadRequestException(
          "El costo de este kit viene de sus componentes",
        );
      for (const [id, kind] of [
        [individual, "individual"],
        [kit, "kit"],
      ] as const) {
        if (!id) continue;
        const [item] = await em.query(
          "SELECT * FROM supplier_items WHERE id=$1",
          [id],
        );
        if (!item || item.provider_id !== providerId)
          throw new BadRequestException("La oferta no pertenece al proveedor");
        checkPackaging(p.name, item.name, body.presentation_confirmed === true);
        if (kind === "kit" && (!item.is_pack || !/\bx\s*7\b/i.test(item.name)))
          throw new BadRequestException("Seleccioná un kit x7");
        if (kind === "individual") {
          if (/\bx\s*7\b/i.test(item.name) && item.is_pack)
            throw new BadRequestException(
              "Usá el selector de kit x7 para esta oferta",
            );
          if (
            (item.is_pack || individualUnits !== 1) &&
            body.pack_confirmed !== true
          )
            throw new BadRequestException(
              "Confirmá cuántas unidades vendibles contiene la oferta",
            );
          if (!item.is_pack && individualUnits !== 1)
            throw new BadRequestException(
              "La oferta individual corresponde a una unidad",
            );
        }
      }
      await em.query(
        `INSERT INTO product_links(product_id,provider_id,individual_item_id,kit_item_id,individual_units) VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id,provider_id) DO UPDATE SET individual_item_id=excluded.individual_item_id,kit_item_id=excluded.kit_item_id,individual_units=excluded.individual_units,last_cost=NULL,last_currency=NULL,last_basis=NULL,last_item_id=NULL,last_cost_at=NULL`,
        [productId, providerId, individual, kit, individualUnits],
      );
      await em.query(
        "UPDATE products SET preferred_provider_id=coalesce(preferred_provider_id,$1) WHERE id=$2",
        [providerId, productId],
      );
      await rememberCosts(em);
    });
    return { ok: true };
  }
  async deleteLink(productId: number, providerId: number) {
    await db.transaction(async (em) => {
      await em.query(
        "DELETE FROM product_links WHERE product_id=$1 AND provider_id=$2",
        [productId, providerId],
      );
      await em.query(
        "UPDATE products SET preferred_provider_id=NULL WHERE id=$1 AND preferred_provider_id=$2",
        [productId, providerId],
      );
    });
    return { ok: true };
  }
  async refresh(providerId: number) {
    const [provider] = await db.query("SELECT id FROM providers WHERE id=$1", [
      providerId,
    ]);
    if (!provider) throw new NotFoundException("Proveedor inexistente");
    await db.query(
      "INSERT INTO refresh_runs(provider_id,status,trigger) VALUES($1,'queued','manual') ON CONFLICT DO NOTHING",
      [providerId],
    );
    const [run] = await db.query(
      "SELECT * FROM refresh_runs WHERE provider_id=$1 AND status IN ('queued','running') ORDER BY id DESC LIMIT 1",
      [providerId],
    );
    return run;
  }
  async runs() {
    const rows = await db.query(
      "SELECT (to_jsonb(r)-'price_changes') || jsonb_build_object('provider_name',p.name) data FROM refresh_runs r JOIN providers p ON p.id=r.provider_id ORDER BY r.id DESC LIMIT 30",
    );
    return rows.map((r: any) => r.data);
  }
  async priceChanges(id: number, query: any) {
    const [run] = await db.query(
      "SELECT status,price_analysis,price_changes FROM refresh_runs WHERE id=$1",
      [id],
    );
    if (!run) throw new NotFoundException("Actualización no encontrada");
    const page = integer(query.page || 1);
    const direction = query.direction || "all";
    if (!["all", "up", "down", "currency"].includes(direction))
      throw new BadRequestException("Filtro inválido");
    const search = String(query.search || "")
      .trim()
      .toLocaleLowerCase("es");
    if (search.length > 500)
      throw new BadRequestException("Búsqueda demasiado larga");
    const changes = (run.price_changes || []).filter(
      (c: any) =>
        (direction === "all" || c.direction === direction) &&
        (!search ||
          [c.name, c.internal_code, c.barcode, c.external_id].some((v) =>
            String(v || "")
              .toLocaleLowerCase("es")
              .includes(search),
          )),
    );
    return {
      summary: run.price_analysis,
      total: changes.length,
      page,
      items: changes.slice((page - 1) * 30, page * 30),
    };
  }
}
