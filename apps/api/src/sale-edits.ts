import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { integer, optionalText } from "./catalog";
import { stockQuantity } from "./inventory";
import { ars, date, prepareSaleItems } from "./sales";
import { priceSale, saleDiscount } from "./sale-money";
import {
  correctionHash,
  correctionTransaction,
  paymentState,
  replacePaymentApplication,
} from "./sale-corrections";

export async function saleEditState(em: any, id: number) {
  const state = await paymentState(em, id);
  const items = await em.query(
    "SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id",
    [id],
  );
  for (const i of items)
    i.components = await em.query(
      "SELECT * FROM sale_components WHERE sale_item_id=$1 ORDER BY id",
      [i.id],
    );
  return { ...state, items };
}
/** Public editing contract: retained item IDs reference authoritative historical snapshots. */
export async function prepareSaleEdit(
  em: any,
  id: number,
  body: any,
  allowPaid = false,
) {
  const state = await saleEditState(em, id);
  if (state.sale.status === "annulled" || state.sale.annulled_at)
    throw new BadRequestException("La venta está anulada");
  if (!allowPaid && state.payments.length)
    throw new (body.preview_token ? ConflictException : BadRequestException)(
      "Esta venta tiene cobros. Usá la edición conjunta de venta y cobros.",
    );
  const customer = body.customer_id ? integer(body.customer_id) : null;
  const [client] = customer
    ? await em.query("SELECT * FROM customers WHERE id=$1", [customer])
    : [];
  if (customer && !client) throw new NotFoundException("Cliente inexistente");
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 100
  )
    throw new BadRequestException("Agregá productos a la venta");
  const products = await em.query("SELECT * FROM products ORDER BY id");
  const prepared: any[] = [],
    seen = new Set<number>();
  for (const item of body.items) {
    const quantity = stockQuantity(item.quantity);
    if (!quantity) throw new BadRequestException("Cantidad inválida");
    const old = item.id
      ? state.items.find((i: any) => i.id === integer(item.id))
      : null;
    if (item.id && !old)
      throw new BadRequestException("Renglón histórico inexistente");
    if (old && seen.has(old.id))
      throw new BadRequestException("Renglón histórico repetido");
    if (old) seen.add(old.id);
    const product_id = integer(item.product_id);
    if (old && old.product_id === product_id) {
      const unit =
        item.unit_price == null ? String(old.unit_price) : ars(item.unit_price);
      const replacements = item.replacements || [];
      if (!Array.isArray(replacements) || replacements.length > 1000)
        throw new BadRequestException("Sabores inválidos");
      const replacementIds = new Map<number, any>();
      for (const r of replacements) {
        const matches = old.components.filter((c: any) =>
          r.original_component_id
            ? c.id === integer(r.original_component_id)
            : c.product_id === integer(r.original_product_id),
        );
        if (matches.length !== 1)
          throw new BadRequestException("Componente histórico inválido");
        replacementIds.set(matches[0].id, [
          ...(replacementIds.get(matches[0].id) || []),
          r,
        ]);
      }
      const parts = [];
      for (const part of old.components) {
        const perUnit = new Decimal(part.quantity).div(old.quantity);
        const replacements = replacementIds.get(part.id) || [
          { product_id: part.product_id, quantity: perUnit.toNumber() },
        ];
        const allocations = replacements.map((r: any) => ({
          ...r,
          quantity:
            r.quantity == null ? perUnit.toNumber() : stockQuantity(r.quantity),
        }));
        if (
          !new Decimal(
            allocations.reduce((s: number, r: any) => s + r.quantity, 0),
          ).eq(perUnit)
        )
          throw new BadRequestException(
            "Elegí cada unidad del componente histórico",
          );
        for (const replacement of allocations) {
          const target = integer(replacement.product_id);
          let p = products.find((p: any) => p.id === target),
            cost = part.unit_cost;
          if (!p) throw new NotFoundException("Componente inexistente");
          if (target !== part.product_id) {
            const source = products.find((p: any) => p.id === part.product_id);
            if (
              old.product_id === part.product_id ||
              !source?.variant_group ||
              source.variant_group !== p.variant_group ||
              p.kind === "kit" ||
              p.archived
            )
              throw new BadRequestException(
                "El sabor no corresponde a la presentación",
              );
            const current = await prepareSaleItems(em, [
              {
                product_id: target,
                quantity: 1,
                unit_price: null,
                selections: [],
              },
            ]);
            cost = current.prepared[0].parts[0].cost;
          }
          const units = replacement.quantity * quantity;
          if (!Number.isSafeInteger(units) || units < 1 || units > 1e9)
            throw new BadRequestException("Cantidad de componentes inválida");
          parts.push({
            product:
              target === part.product_id
                ? { ...p, name: part.product_name }
                : p,
            quantity: units,
            cost,
          });
        }
      }
      const cost = parts.every((p) => p.cost != null)
        ? parts
            .reduce(
              (s, p) => s.plus(new Decimal(p.cost).mul(p.quantity)),
              new Decimal(0),
            )
            .toString()
        : null;
      prepared.push({
        id: old.id,
        product: { id: product_id, name: old.product_name },
        quantity,
        unit,
        total: new Decimal(unit).mul(quantity).toString(),
        cost,
        parts,
      });
    } else {
      const selections = item.selections || [];
      if (!Array.isArray(selections) || selections.length > 1000)
        throw new BadRequestException("Sabores inválidos");
      const fresh = await prepareSaleItems(em, [
        {
          product_id,
          quantity,
          unit_price: item.unit_price == null ? null : ars(item.unit_price),
          selections: selections.map((s: any) => ({
            component_product_id: integer(s.component_product_id),
            product_id: integer(s.product_id),
            quantity: stockQuantity(s.quantity),
          })),
        },
      ]);
      prepared.push({ ...fresh.prepared[0], id: old?.id });
    }
  }
  const priced = priceSale(prepared, saleDiscount(body.discount));
  const paid = state.payments.reduce(
    (s: Decimal, p: any) => s.plus(p.amount),
    new Decimal(0),
  );
  if (!allowPaid && !customer && new Decimal(priced.total).gt(0))
    throw new BadRequestException(
      "Elegí un cliente para dejar saldo pendiente",
    );
  const beforeNeeded = new Map<number, number>(),
    afterNeeded = new Map<number, number>();
  for (const i of state.items)
    for (const c of i.components)
      beforeNeeded.set(
        c.product_id,
        (beforeNeeded.get(c.product_id) || 0) + c.quantity,
      );
  for (const i of prepared)
    for (const c of i.parts)
      afterNeeded.set(
        c.product.id,
        (afterNeeded.get(c.product.id) || 0) + c.quantity,
      );
  const stock = [];
  for (const product_id of new Set([
    ...beforeNeeded.keys(),
    ...afterNeeded.keys(),
  ])) {
    const p = products.find((p: any) => p.id === product_id),
      delta =
        (beforeNeeded.get(product_id) || 0) -
        (afterNeeded.get(product_id) || 0);
    if (!p || p.own_stock == null)
      throw new BadRequestException("Cargá el stock real de los componentes");
    const after = p.own_stock + delta;
    if (!Number.isSafeInteger(after) || Math.abs(after) > 1e9)
      throw new BadRequestException("Stock fuera de rango");
    stock.push({ product_id, name: p.name, before: p.own_stock, delta, after });
  }
  const debts = [];
  for (const customer_id of new Set(
    [state.sale.customer_id, customer].filter(Boolean),
  )) {
    const [c] = await em.query(
      `SELECT c.name,(coalesce((SELECT sum(total) FROM sales WHERE customer_id=c.id AND coalesce(to_jsonb(sales)->>'status','')<>'annulled'),0)-coalesce((SELECT sum(p.amount) FROM sale_payments p JOIN sales s ON s.id=p.sale_id WHERE s.customer_id=c.id AND coalesce(to_jsonb(s)->>'status','')<>'annulled'),0))::text balance FROM customers c WHERE id=$1`,
      [customer_id],
    );
    let delta = new Decimal(0);
    if (state.sale.customer_id === customer_id)
      delta = delta.minus(new Decimal(state.sale.total).minus(paid));
    if (customer === customer_id)
      delta = delta.plus(new Decimal(priced.total).minus(paid));
    debts.push({
      customer_id,
      name: c.name,
      before: c.balance,
      after: new Decimal(c.balance).plus(delta).toString(),
    });
  }
  const before = {
    total: String(state.sale.total),
    customer_id: state.sale.customer_id,
    sold_on: state.sale.sold_on,
    note: state.sale.note,
    items: state.items,
  };
  const after = {
    total: priced.total,
    subtotal: priced.subtotal,
    discount_mode: priced.discount_mode,
    discount_value: priced.discount_value,
    discount_amount: priced.discount_amount,
    customer_id: customer,
    customer_name: client?.name || null,
    sold_on: date(body.sold_on),
    note: optionalText(body.note),
    cost_total: prepared.every((i) => i.cost != null)
      ? prepared.reduce((s, i) => s.plus(i.cost), new Decimal(0)).toString()
      : null,
  };
  const preview = {
    preview_token: correctionHash({ state, stock, debts, after, prepared }),
    before,
    after,
    stock,
    debts,
    warnings: stock
      .filter((s) => s.after < 0)
      .map((s) => s.name + ": stock negativo " + s.after),
  };
  return { state, prepared: priced.items, preview };
}
export async function applySaleEdit(
  em: any,
  id: number,
  prepared: any[],
  preview: any,
) {
  const batch = randomUUID();
  for (const s of preview.stock) {
    if (!s.delta) continue;
    await em.query("UPDATE products SET own_stock=$2 WHERE id=$1", [
      s.product_id,
      s.after,
    ]);
    await em.query(
      `INSERT INTO stock_movements(batch_id,product_id,product_name,type,quantity,previous_stock,resulting_stock,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        batch,
        s.product_id,
        s.name,
        s.delta > 0 ? "entry" : "exit",
        s.delta,
        s.before,
        s.after,
        "Corrección de venta #" + id,
      ],
    );
  }
  const keep = [];
  for (const i of prepared) {
    const values = [
      id,
      i.product.id,
      i.product.name,
      i.quantity,
      i.unit,
      i.total,
      i.cost,
      i.subtotal,
      i.discount_amount,
    ];
    const result = i.id
      ? await em.query(
          "UPDATE sale_items SET product_id=$2,product_name=$3,quantity=$4,unit_price=$5,total=$6,cost_total=$7,subtotal=$8,discount_amount=$9 WHERE id=$10 AND sale_id=$1 RETURNING id",
          [...values, i.id],
        )
      : await em.query(
          "INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,total,cost_total,subtotal,discount_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
          values,
        );
    const row = i.id ? result[0][0] : result[0];
    keep.push(row.id);
    await em.query("DELETE FROM sale_components WHERE sale_item_id=$1", [
      row.id,
    ]);
    for (const p of i.parts) {
      const s = preview.stock.find((s: any) => s.product_id === p.product.id);
      await em.query(
        "INSERT INTO sale_components(sale_item_id,product_id,product_name,quantity,unit_cost,previous_stock,resulting_stock) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          row.id,
          p.product.id,
          p.product.name,
          p.quantity,
          p.cost,
          s.before,
          s.after,
        ],
      );
    }
  }
  await em.query(
    "DELETE FROM sale_components WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id=$1 AND NOT(id=ANY($2::int[])))",
    [id, keep],
  );
  await em.query(
    "DELETE FROM sale_items WHERE sale_id=$1 AND NOT(id=ANY($2::int[]))",
    [id, keep],
  );
  const a = preview.after;
  await em.query(
    "UPDATE sales SET customer_id=$2,customer_name=$3,sold_on=$4,note=$5,total=$6,cost_total=$7,subtotal=$8,discount_mode=$9,discount_value=$10,discount_amount=$11 WHERE id=$1",
    [
      id,
      a.customer_id,
      a.customer_name,
      a.sold_on,
      a.note,
      a.total,
      a.cost_total,
      a.subtotal,
      a.discount_mode,
      a.discount_value,
      a.discount_amount,
    ],
  );
}
export async function previewSaleEdit(id: number, body: any) {
  return db.transaction(
    async (em) => (await prepareSaleEdit(em, id, body)).preview,
  );
}
export async function editSale(id: number, body: any) {
  return correctionTransaction("edit", id, body, true, async (em) => {
    await em.query("SELECT id FROM sales WHERE id=$1 FOR UPDATE", [id]);
    const p = await prepareSaleEdit(em, id, body);
    if (p.preview.preview_token !== body.preview_token)
      throw new ConflictException(
        "La venta o el stock cambió. Revisá nuevamente.",
      );
    await applySaleEdit(em, id, p.prepared, p.preview);
    return { ...p.preview, id };
  });
}

/** Joint correction keeps historical sale preparation and receipt applications in one boundary. */
async function prepareJointEdit(em: any, id: number, body: any) {
  const p = await prepareSaleEdit(em, id, body, true);
  const originals = p.state.payments;
  const edits = body.payments ?? originals;
  if (!Array.isArray(edits) || edits.length !== originals.length)
    throw new BadRequestException("Revisá todos los cobros de esta venta");
  const seen = new Set<number>();
  const payments: any[] = [];
  const deltas = new Map<number, Decimal>();
  const add = (id: number, amount: Decimal) =>
    deltas.set(id, (deltas.get(id) || new Decimal(0)).plus(amount));
  for (const old of originals)
    add(old.account_id, new Decimal(old.amount).negated());
  for (const edit of edits) {
    const paymentId = integer(edit.id);
    if (seen.has(paymentId) || !originals.some((x: any) => x.id === paymentId))
      throw new BadRequestException("Aplicación de cobro inválida");
    seen.add(paymentId);
    const amount = ars(edit.amount),
      account = integer(edit.account_id),
      occurred_on = date(edit.occurred_on);
    const [a] = await em.query(
      "SELECT id,name,currency,opening_balance::text FROM cash_accounts WHERE id=$1",
      [account],
    );
    if (!a || a.currency !== "ARS" || a.opening_balance == null)
      throw new BadRequestException("Elegí una cuenta ARS con saldo inicial");
    payments.push({
      id: paymentId,
      amount,
      account_id: account,
      account_name: a.name,
      occurred_on,
    });
    add(account, new Decimal(amount));
  }
  const paid = payments.reduce(
    (s: Decimal, x: any) => s.plus(x.amount),
    new Decimal(0),
  );
  if (paid.gt(p.preview.after.total))
    throw new BadRequestException(
      "Lo cobrado supera el nuevo total. Corregí también los cobros.",
    );
  if (!p.preview.after.customer_id && paid.lt(p.preview.after.total))
    throw new BadRequestException(
      "Elegí un cliente para dejar saldo pendiente",
    );
  const cash = [];
  for (const [account_id, delta] of [...deltas].sort((a, b) => a[0] - b[0])) {
    const [a] = await em.query(
      "SELECT a.name,(a.opening_balance+coalesce(sum(e.amount),0))::text balance FROM cash_accounts a LEFT JOIN cash_entries e ON e.account_id=a.id WHERE a.id=$1 GROUP BY a.id",
      [account_id],
    );
    cash.push({
      account_id,
      name: a.name,
      before: a.balance,
      delta: delta.toString(),
      after: new Decimal(a.balance).plus(delta).toString(),
    });
  }
  const oldPaid = originals.reduce(
    (s: Decimal, x: any) => s.plus(x.amount),
    new Decimal(0),
  );
  for (const d of p.preview.debts)
    if (d.customer_id === p.preview.after.customer_id)
      d.after = new Decimal(d.after).plus(oldPaid).minus(paid).toString();
  const before = {
    ...p.preview.before,
    payments: originals,
    paid: oldPaid.toString(),
    pending: new Decimal(p.state.sale.total).minus(oldPaid).toString(),
  };
  const after = {
    ...p.preview.after,
    payments,
    paid: paid.toString(),
    pending: new Decimal(p.preview.after.total).minus(paid).toString(),
  };
  const preview = { ...p.preview, before, after, cash };
  preview.preview_token = correctionHash({
    base: p.preview.preview_token,
    before,
    after,
    cash,
    debts: preview.debts,
  });
  return { ...p, payments, preview };
}
export async function previewJointSaleEdit(id: number, body: any) {
  return db.transaction(
    async (em) => (await prepareJointEdit(em, id, body)).preview,
  );
}
export async function jointEditSale(id: number, body: any) {
  return correctionTransaction("joint-edit", id, body, true, async (em) => {
    await em.query("SELECT id FROM sales WHERE id=$1 FOR UPDATE", [id]);
    let p;
    try {
      p = await prepareJointEdit(em, id, body);
    } catch (error) {
      if (error instanceof BadRequestException && body.preview_token)
        throw new ConflictException(
          "La venta o sus cobros cambió. Revisá nuevamente.",
        );
      throw error;
    }
    if (p.preview.preview_token !== body.preview_token)
      throw new ConflictException(
        "La venta, los cobros o el stock cambió. Revisá nuevamente.",
      );
    await applySaleEdit(em, id, p.prepared, p.preview);
    for (const payment of p.payments) {
      const old = p.state.payments.find((x: any) => x.id === payment.id);
      if (
        new Decimal(old.amount).eq(payment.amount) &&
        old.account_id === payment.account_id &&
        old.occurred_on === payment.occurred_on
      )
        continue;
      await replacePaymentApplication(
        em,
        old,
        new Decimal(payment.amount).isZero()
          ? null
          : {
              amount: payment.amount,
              account: payment.account_id,
              date: payment.occurred_on,
            },
        id,
      );
    }
    return { ...p.preview, id };
  });
}
