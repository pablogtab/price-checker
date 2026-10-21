import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "./db";
import {
  integer,
  money,
  text,
  optionalText,
  readLinks,
  linkShape,
} from "./catalog";
import { stockQuantity } from "./inventory";
import { calculate, chooseCost } from "./pricing";
import { kitSellingPrice } from "./bundles";
import { saleDiscount, priceSale } from "./sale-money";

export function date(value: any) {
  const d = String(value || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
    !Number.isFinite(Date.parse(d)) ||
    new Date(d).toISOString().slice(0, 10) !== d
  )
    throw new BadRequestException("Fecha inválida");
  return d;
}
export function key(value: any) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value || "",
    )
  )
    throw new BadRequestException("Identificador inválido");
  return value;
}
export function ars(value: any, positive = false) {
  const amount = money(value, positive);
  if (new Decimal(amount).decimalPlaces() > 2)
    throw new BadRequestException("Usá hasta dos decimales en ARS");
  return amount;
}
export async function customers() {
  return db.query(`SELECT c.*,coalesce(d.total,0)::text sold,(coalesce(d.total,0)-coalesce(p.total,0))::text balance FROM customers c
    LEFT JOIN LATERAL(SELECT sum(total) total FROM sales WHERE customer_id=c.id) d ON true
    LEFT JOIN LATERAL(SELECT sum(sp.amount) total FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id WHERE s.customer_id=c.id) p ON true ORDER BY c.name,c.id`);
}
export async function saveCustomer(body: any, id?: number) {
  const phone = optionalText(body.phone);
  if (phone && phone.length > 100)
    throw new BadRequestException("El teléfono admite hasta 100 caracteres");
  const instagram = optionalText(body.instagram);
  if (instagram && instagram.length > 100)
    throw new BadRequestException("Instagram admite hasta 100 caracteres");
  const values = [
    text(body.name, 100),
    phone,
    optionalText(body.note),
    instagram,
  ];
  const [c] = id
    ? await db.query(
        "UPDATE customers SET name=$1,phone=$2,note=$3,instagram=CASE WHEN $5::boolean THEN $4 ELSE instagram END WHERE id=$6 RETURNING *",
        [...values, body.instagram !== undefined, id],
      )
    : await db.query(
        "INSERT INTO customers(name,phone,note,instagram) VALUES($1,$2,$3,$4) RETURNING *",
        values,
      );
  if (!c) throw new NotFoundException("Cliente inexistente");
  return c;
}
export async function sales(query: any = {}) {
  const customer = query.customer_id ? integer(query.customer_id) : null;
  const rows = await db.query(
    `SELECT s.*,s.sold_on::text,s.total::text,s.subtotal::text,s.discount_value::text,s.discount_amount::text,s.cost_total::text,(s.total-coalesce(p.paid,0))::text pending,coalesce(p.paid,0)::text paid FROM sales s LEFT JOIN LATERAL(SELECT sum(amount) paid FROM sale_payments WHERE sale_id=s.id) p ON true WHERE ($1::int IS NULL OR customer_id=$1) ORDER BY s.sold_on DESC,s.id DESC LIMIT $2 OFFSET $3`,
    [customer, query.page ? 25 : 100, query.page ? (integer(query.page)-1)*25 : 0],
  );
  if (!rows.length) return rows;
  const ids = rows.map((s: any) => s.id);
  const items = await db.query(
    "SELECT *,unit_price::text,total::text,subtotal::text,discount_amount::text,cost_total::text FROM sale_items WHERE sale_id=ANY($1::int[]) ORDER BY id",
    [ids],
  );
  const parts = await db.query(
    "SELECT c.*,c.unit_cost::text FROM sale_components c JOIN sale_items i ON i.id=c.sale_item_id WHERE i.sale_id=ANY($1::int[]) ORDER BY c.id",
    [ids],
  );
  const payments = await db.query(
    `SELECT sp.*,sp.amount::text,o.occurred_on::text,e.account_id,a.name account_name FROM sale_payments sp JOIN cash_operations o ON o.id=sp.operation_id JOIN cash_entries e ON e.operation_id=o.id JOIN cash_accounts a ON a.id=e.account_id WHERE sp.sale_id=ANY($1::int[]) ORDER BY sp.id`,
    [ids],
  );
  return rows.map((s: any) => ({
    ...s,
    items: items
      .filter((i: any) => i.sale_id === s.id)
      .map((i: any) => ({
        ...i,
        components: parts.filter((p: any) => p.sale_item_id === i.id),
      })),
    payments: payments.filter((p: any) => p.sale_id === s.id),
  }));
}
async function receipt(
  em: any,
  saleId: number,
  accountId: number,
  amount: string,
  occurredOn: string,
  requestKey: string,
  fingerprint: string,
) {
  const [account] = await em.query(
    "SELECT * FROM cash_accounts WHERE id=$1 FOR UPDATE",
    [accountId],
  );
  if (!account) throw new NotFoundException("Cuenta inexistente");
  if (account.currency !== "ARS")
    throw new BadRequestException(
      "Elegí una cuenta en ARS para cobrar la venta",
    );
  if (account.opening_balance == null)
    throw new BadRequestException(
      "Cargá primero el saldo inicial de la cuenta",
    );
  const [operation] = await em.query(
    "INSERT INTO cash_operations(kind,occurred_on,note,request_key,fingerprint) VALUES('income',$1,$2,$3,$4) RETURNING id",
    [occurredOn, "Cobro de venta #" + saleId, requestKey, fingerprint],
  );
  await em.query(
    "INSERT INTO cash_entries(operation_id,account_id,amount) VALUES($1,$2,$3)",
    [operation.id, accountId, amount],
  );
  await em.query(
    "INSERT INTO sale_payments(sale_id,operation_id,amount) VALUES($1,$2,$3)",
    [saleId, operation.id, amount],
  );
  return { id: operation.id };
}
export async function collectSale(id: number, body: any) {
  const amount = ars(body.amount, true),
    account = integer(body.account_id),
    d = date(body.occurred_on),
    k = key(body.request_key);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ sale: id, amount, account, date: d }))
    .digest("hex");
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713453)");
    const [old] = await em.query(
      "SELECT id,fingerprint FROM cash_operations WHERE request_key=$1",
      [k],
    );
    if (old) {
      if (old.fingerprint !== fingerprint)
        throw new ConflictException(
          "Este cobro ya se registró con otros datos",
        );
      return { id: old.id };
    }
    const [sale] = await em.query(
      "SELECT * FROM sales WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!sale) throw new NotFoundException("Venta inexistente");
    const [paid] = await em.query(
      "SELECT coalesce(sum(amount),0)::text amount FROM sale_payments WHERE sale_id=$1",
      [id],
    );
    if (new Decimal(amount).gt(new Decimal(sale.total).minus(paid.amount)))
      throw new BadRequestException(
        "El cobro supera el saldo pendiente de la venta",
      );
    return receipt(em, id, account, amount, d, k, fingerprint);
  });
}
export async function createSale(body: any) {
  const k = key(body.request_key),
    d = date(body.sold_on),
    customer = body.customer_id ? integer(body.customer_id) : null,
    note = optionalText(body.note);
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 100
  )
    throw new BadRequestException("Agregá productos a la venta");
  const items = body.items.map((i: any) => {
    const quantity = stockQuantity(i.quantity);
    if (!quantity) throw new BadRequestException("Cantidad inválida");
    const selections = i.selections || [];
    if (!Array.isArray(selections) || selections.length > 1000)
      throw new BadRequestException("Selección de sabores inválida");
    return {
      product_id: integer(i.product_id),
      quantity,
      unit_price: i.unit_price == null ? null : ars(i.unit_price),
      selections: selections.map((s: any) => ({
        component_product_id: integer(s.component_product_id),
        product_id: integer(s.product_id),
        quantity: stockQuantity(s.quantity),
      })),
    };
  });
  const discount = saleDiscount(body.discount);
  const payment = body.payment
    ? {
        account: integer(body.payment.account_id),
        amount: ars(body.payment.amount, true),
      }
    : null;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ d, customer, note, items, payment, discount }))
    .digest("hex");
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713450)");
    await em.query("SELECT pg_advisory_xact_lock(713453)");
    const [old] = await em.query(
      "SELECT id,fingerprint FROM sales WHERE request_key=$1",
      [k],
    );
    if (old) {
      if (old.fingerprint !== fingerprint)
        throw new ConflictException(
          "Esta venta ya se registró con otros datos",
        );
      const rows = await em.query(
        `SELECT c.product_name,min(c.resulting_stock)::int resulting_stock FROM sale_components c JOIN sale_items i ON i.id=c.sale_item_id WHERE i.sale_id=$1 AND c.resulting_stock<0 GROUP BY c.product_id,c.product_name`,
        [old.id],
      );
      return {
        id: old.id,
        warnings: rows.map(
          (p: any) => p.product_name + ": stock negativo " + p.resulting_stock,
        ) as string[],
      };
    }
    const [client] = customer
      ? await em.query("SELECT * FROM customers WHERE id=$1", [customer])
      : [];
    if (customer && !client) throw new NotFoundException("Cliente inexistente");
    const { products, prepared, needed } = await prepareSaleItems(em, items);
    const priced = priceSale(prepared, discount);
    const total = new Decimal(priced.total);
    if (total.gt("1e15")) throw new BadRequestException("Total fuera de rango");
    if (payment && new Decimal(payment.amount).gt(total))
      throw new BadRequestException("El cobro supera el total de la venta");
    if (!customer && total.gt(payment?.amount || 0))
      throw new BadRequestException(
        "Elegí un cliente para dejar saldo en cuenta corriente",
      );
    const warnings: string[] = [];
    for (const [id, q] of needed) {
      const p = products.find((p: any) => p.id === id);
      if (p.own_stock == null)
        throw new BadRequestException(
          "Cargá primero el stock real de " + p.name,
        );
      if (p.own_stock - q < -1e9)
        throw new BadRequestException("Stock fuera de rango: " + p.name);
      if (p.own_stock < q)
        warnings.push(
          p.name +
            ": stock actual " +
            p.own_stock +
            ", queda " +
            (p.own_stock - q),
        );
    }
    const cost = prepared.every((i: any) => i.cost != null)
      ? prepared
          .reduce((sum: Decimal, i: any) => sum.plus(i.cost), new Decimal(0))
          .toString()
      : null;
    const [sale] = await em.query(
      "INSERT INTO sales(customer_id,customer_name,sold_on,note,total,cost_total,request_key,fingerprint,subtotal,discount_mode,discount_value,discount_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
      [
        customer,
        client?.name || null,
        d,
        note,
        total.toString(),
        cost,
        k,
        fingerprint,
        priced.subtotal, priced.discount_mode, priced.discount_value, priced.discount_amount,
      ],
    );
    const batch = randomUUID();
    for (const i of priced.items) {
      const [line] = await em.query(
        "INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,total,cost_total,subtotal,discount_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        [
          sale.id,
          i.product.id,
          i.product.name,
          i.quantity,
          i.unit,
          i.total,
          i.cost,
          i.subtotal, i.discount_amount,
        ],
      );
      for (const part of i.parts) {
        const previous = part.product.own_stock,
          next = previous - part.quantity;
        await em.query(
          "INSERT INTO sale_components(sale_item_id,product_id,product_name,quantity,unit_cost,previous_stock,resulting_stock) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            line.id,
            part.product.id,
            part.product.name,
            part.quantity,
            part.cost,
            previous,
            next,
          ],
        );
        await em.query("UPDATE products SET own_stock=$2 WHERE id=$1", [
          part.product.id,
          next,
        ]);
        await em.query(
          `INSERT INTO stock_movements(batch_id,product_id,product_name,type,quantity,previous_stock,resulting_stock,note,kit_id,kit_name) VALUES($1,$2,$3,'exit',$4,$5,$6,$7,$8,$9)`,
          [
            batch,
            part.product.id,
            part.product.name,
            -part.quantity,
            previous,
            next,
            "Venta #" + sale.id,
            i.product.kind === "kit" ? i.product.id : null,
            i.product.kind === "kit" ? i.product.name : null,
          ],
        );
        part.product.own_stock = next;
      }
    }
    if (payment)
      await receipt(
        em,
        sale.id,
        payment.account,
        payment.amount,
        d,
        randomUUID(),
        "sale:" + k,
      );
    return { id: sale.id, warnings };
  });
}
export async function salesSummary() {
  const [s] = await db.query(
    `SELECT count(*)::int count,coalesce(sum(total),0)::text total,coalesce(sum(total) FILTER(WHERE sold_on >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date-29),0)::text recent_total,coalesce(sum(total-cost_total) FILTER(WHERE cost_total IS NOT NULL),0)::text profit,count(*) FILTER(WHERE cost_total IS NULL)::int missing_cost FROM sales`,
  );
  const [paid] = await db.query(
    "SELECT coalesce(sum(amount),0)::text total FROM sale_payments",
  );
  return {
    ...s,
    paid: paid.total,
    pending: new Decimal(s.total).minus(paid.total).toString(),
  };
}

export async function prepareSaleItems(em: any, items: any[]) {
    const products = await em.query(
      "SELECT *,selling_price::text FROM products WHERE NOT archived ORDER BY id FOR UPDATE",
    );
    const components = await em.query(
      "SELECT * FROM product_components ORDER BY kit_id,product_id",
    );
    const links = await readLinks(em),
      [settings] = await em.query(
        "SELECT usd_ars::text FROM settings WHERE id=1",
      );
    const prepared: any[] = [],
      needed = new Map<number, number>();
    for (const item of items) {
      const product = products.find((p: any) => p.id === item.product_id);
      if (!product) throw new NotFoundException("Producto inexistente");
      const parts = new Map<number, number>();
      if (product.kind !== "kit") {
        if (item.selections.length)
          throw new BadRequestException(
            "Un producto individual no admite componentes",
          );
        parts.set(product.id, 1);
      } else {
        const cs = components.filter((c: any) => c.kit_id === product.id);
        if (!cs.length)
          throw new BadRequestException("La promo no tiene componentes");
        if (
          item.selections.some(
            (s: any) =>
              !cs.some(
                (c: any) =>
                  c.variant_group && c.product_id === s.component_product_id,
              ),
          )
        )
          throw new BadRequestException("Componente de sabor inválido");
        for (const c of cs) {
          if (!c.variant_group) {
            parts.set(
              c.product_id,
              (parts.get(c.product_id) || 0) + c.quantity,
            );
            continue;
          }
          const chosen = item.selections.filter(
            (s: any) => s.component_product_id === c.product_id,
          );
          if (
            chosen.reduce((sum: number, s: any) => sum + s.quantity, 0) !==
            c.quantity
          )
            throw new BadRequestException(
              "Elegí los sabores y cantidades de cada componente por promo",
            );
          for (const s of chosen) {
            const variant = products.find(
              (p: any) =>
                p.id === s.product_id &&
                p.kind === "product" &&
                p.variant_group === c.variant_group,
            );
            if (!variant || !s.quantity)
              throw new BadRequestException(
                "El sabor no corresponde a la presentación",
              );
            parts.set(
              s.product_id,
              (parts.get(s.product_id) || 0) + s.quantity,
            );
          }
        }
      }
      let base = new Decimal(0),
        cost = new Decimal(0),
        known = true;
      const resolved = [...parts].map(([id, q]) => {
        const p = products.find((p: any) => p.id === id && p.kind !== "kit");
        if (!p) throw new BadRequestException("Componente inexistente");
        const offers = links.filter((l: any) => l.product_id === id),
          link =
            offers.find(
              (l: any) => l.provider_id === p.preferred_provider_id,
            ) || offers[0];
        const c = calculate(
          p.selling_price,
          link ? chooseCost(linkShape(link)) : null,
          settings.usd_ars,
        ).costArs;
        base = base.plus(new Decimal(p.selling_price).mul(q));
        if (c == null) known = false;
        else cost = cost.plus(new Decimal(c).mul(q));
        const quantity = q * item.quantity;
        if (!Number.isSafeInteger(quantity) || quantity > 1e9)
          throw new BadRequestException("Cantidad fuera de rango");
        needed.set(id, (needed.get(id) || 0) + quantity);
        return { product: p, quantity, cost: c };
      });
      const suggested =
        product.kind === "kit" && product.kit_pricing_mode === "discount"
          ? kitSellingPrice(
              [{ quantity: 1, selling_price: base.toString() }],
              product.kit_discount_percent,
            ).selling_price
          : product.selling_price;
      const unit =
        item.unit_price ?? new Decimal(suggested).toDecimalPlaces(2).toString();
      prepared.push({
        ...item,
        product,
        parts: resolved,
        unit,
        total: new Decimal(unit).mul(item.quantity).toString(),
        cost: known ? cost.mul(item.quantity).toString() : null,
      });
    }

return { products, prepared, needed };
}
