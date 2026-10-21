import { BadRequestException, ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "./db";
import {
  correctionHash,
  correctionTransaction,
  paymentState,
  replacePaymentApplication,
} from "./sale-corrections";
async function preview(em: any, id: number) {
  const state = await paymentState(em, id);
  if (state.sale.status === "annulled")
    throw new BadRequestException("La venta ya está anulada");
  const components = await em.query(
    "SELECT c.* FROM sale_components c JOIN sale_items i ON i.id=c.sale_item_id WHERE i.sale_id=$1 ORDER BY c.id",
    [id],
  );
  const stock = await em.query(
    `SELECT p.id,p.name,p.own_stock before,sum(c.quantity)::text quantity FROM sale_components c JOIN sale_items i ON i.id=c.sale_item_id JOIN products p ON p.id=c.product_id WHERE i.sale_id=$1 GROUP BY p.id ORDER BY p.id`,
    [id],
  );
  for (const p of stock) {
    if (p.before == null)
      throw new BadRequestException(
        "Cargá el stock actual de " + p.name + " antes de anular",
      );
    const after = new Decimal(p.before).plus(p.quantity);
    if (after.abs().gt(1000000000))
      throw new BadRequestException("El stock resultante supera el límite");
    p.quantity = Number(p.quantity);
    p.after = after.toNumber();
  }
  const cash = [];
  const deltas = new Map<number, Decimal>();
  for (const p of state.payments)
    deltas.set(
      p.account_id,
      (deltas.get(p.account_id) || new Decimal(0)).minus(p.amount),
    );
  for (const [account_id, delta] of deltas) {
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
  const paid = state.payments.reduce(
    (n: Decimal, p: any) => n.plus(p.amount),
    new Decimal(0),
  );
  const [debt] = await em.query(
    "SELECT coalesce(sum(s.total),0)-(SELECT coalesce(sum(p.amount),0) FROM sale_payments p JOIN sales x ON x.id=p.sale_id WHERE x.customer_id=$1 AND x.status='active') balance FROM sales s WHERE s.customer_id=$1 AND s.status='active'",
    [state.sale.customer_id],
  );
  const before = {
    payments: state.payments,
    components,
    status: "active",
    total: String(state.sale.total),
    paid: paid.toString(),
    pending: new Decimal(state.sale.total).minus(paid).toString(),
  };
  const after = { status: "annulled", total: "0", paid: "0", pending: "0" };
  return {
    preview_token: correctionHash({ state, components, stock, cash, debt }),
    before,
    after,
    stock,
    cash,
    customer_balance_before: String(debt.balance),
    customer_balance_after: new Decimal(debt.balance)
      .minus(before.pending)
      .toString(),
  };
}
export async function previewSaleAnnulment(id: number) {
  return db.transaction((em) => preview(em, id));
}
export async function annulSale(id: number, body: any) {
  return correctionTransaction("annul", id, body, true, async (em) => {
    await em.query("SELECT id FROM sales WHERE id=$1 FOR UPDATE", [id]);
    const current = await paymentState(em, id);
    if (current.sale.status === "annulled")
      throw new ConflictException(
        "La venta ya fue anulada. Actualizá el historial.",
      );
    const p = await preview(em, id);
    if (p.preview_token !== body.preview_token)
      throw new ConflictException(
        "La venta, el stock o Caja cambiaron. Revisá y confirmá nuevamente.",
      );
    const state = await paymentState(em, id);
    const batch = randomUUID();
    for (const s of p.stock) {
      await em.query("UPDATE products SET own_stock=$2 WHERE id=$1", [
        s.id,
        s.after,
      ]);
      await em.query(
        "INSERT INTO stock_movements(batch_id,product_id,product_name,type,quantity,previous_stock,resulting_stock,note) VALUES($1,$2,$3,'entry',$4,$5,$6,$7)",
        [
          batch,
          s.id,
          s.name,
          s.quantity,
          s.before,
          s.after,
          "Anulación de venta #" + id,
        ],
      );
    }
    for (const payment of state.payments)
      await replacePaymentApplication(em, payment, null, id);
    await em.query(
      "UPDATE sales SET status='annulled',annulled_at=now() WHERE id=$1",
      [id],
    );
    return { ...p, id };
  });
}
