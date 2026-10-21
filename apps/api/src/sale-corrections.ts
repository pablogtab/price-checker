import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "./db";
import { integer } from "./catalog";
import { ars, date, key } from "./sales";
export const correctionHash = (value: any) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** All correction paths lock inventory (when needed), then cash, before sale rows. */
export async function correctionTransaction(
  kind: string,
  saleId: number,
  body: any,
  inventory: boolean,
  work: (em: any) => Promise<any>,
) {
  const requestKey = key(body.request_key),
    fingerprint = correctionHash({ kind, saleId, body });
  return db.transaction(async (em) => {
    if (inventory) await em.query("SELECT pg_advisory_xact_lock(713450)");
    await em.query("SELECT pg_advisory_xact_lock(713453)");
    const [prior] = await em.query(
      "SELECT * FROM sale_corrections WHERE request_key=$1",
      [requestKey],
    );
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new ConflictException(
          "La corrección ya se registró con otros datos",
        );
      return prior.result;
    }
    const result = await work(em);
    await em.query(
      "INSERT INTO sale_corrections(sale_id,kind,request_key,fingerprint,before_state,after_state,result) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        saleId,
        kind,
        requestKey,
        fingerprint,
        result.before,
        result.after,
        result,
      ],
    );
    return result;
  });
}
export async function paymentState(em: any, saleId: number) {
  const [sale] = await em.query("SELECT * FROM sales WHERE id=$1", [saleId]);
  if (!sale) throw new NotFoundException("Venta inexistente");
  const payments = await em.query(
    "SELECT p.id,p.operation_id,p.amount::text,e.account_id,o.occurred_on::text FROM sale_payments p JOIN cash_operations o ON o.id=p.operation_id JOIN cash_entries e ON e.operation_id=o.id WHERE p.sale_id=$1 ORDER BY p.id",
    [saleId],
  );
  return { sale, payments };
}
/** Preserve one cash entry per receipt and detach only the selected application. */
export async function replacePaymentApplication(
  em: any,
  payment: any,
  replacement: null | { amount: string; account: number; date: string },
  saleId: number,
) {
  const [remaining] = await em.query(
    "SELECT coalesce(sum(amount),0)::text amount FROM sale_payments WHERE operation_id=$1 AND id<>$2",
    [payment.operation_id, payment.id],
  );
  if (new Decimal(remaining.amount).isZero())
    await em.query("DELETE FROM cash_entries WHERE operation_id=$1", [
      payment.operation_id,
    ]);
  else
    await em.query("UPDATE cash_entries SET amount=$2 WHERE operation_id=$1", [
      payment.operation_id,
      remaining.amount,
    ]);
  if (!replacement) {
    await em.query("DELETE FROM sale_payments WHERE id=$1", [payment.id]);
    return null;
  }
  const [operation] = await em.query(
    "INSERT INTO cash_operations(kind,occurred_on,note,request_key,fingerprint) VALUES('income',$1,$2,$3,$4) RETURNING id",
    [
      replacement.date,
      "Corrección de cobro · Venta #" +
        saleId +
        " · origen #" +
        payment.operation_id,
      randomUUID(),
      "correction",
    ],
  );
  await em.query(
    "INSERT INTO cash_entries(operation_id,account_id,amount) VALUES($1,$2,$3)",
    [operation.id, replacement.account, replacement.amount],
  );
  const [next] = await em.query(
    "UPDATE sale_payments SET operation_id=$2,amount=$3 WHERE id=$1 RETURNING id",
    [payment.id, operation.id, replacement.amount],
  );
  return next.id;
}
async function preview(em: any, saleId: number, paymentId: number, body: any) {
  const amount = ars(body.amount),
    account = integer(body.account_id),
    d = date(body.occurred_on);
  const state = await paymentState(em, saleId),
    payment = state.payments.find((p: any) => p.id === paymentId);
  if (state.sale.status === "annulled" || state.sale.annulled_at)
    throw new BadRequestException("La venta está anulada");
  if (!payment) throw new NotFoundException("Aplicación de cobro inexistente");
  const [destination] = await em.query(
    "SELECT id,name,currency,opening_balance::text FROM cash_accounts WHERE id=$1",
    [account],
  );
  if (
    !destination ||
    destination.currency !== "ARS" ||
    destination.opening_balance == null
  )
    throw new BadRequestException("Elegí una cuenta ARS con saldo inicial");
  const paid = state.payments.reduce(
    (sum: Decimal, p: any) => sum.plus(p.amount),
    new Decimal(0),
  );
  const next = paid.minus(payment.amount).plus(amount);
  if (next.gt(state.sale.total))
    throw new BadRequestException("El cobro supera el total de la venta");
  if (!state.sale.customer_id && next.lt(state.sale.total))
    throw new BadRequestException(
      "Elegí un cliente para dejar saldo pendiente",
    );
  const before = {
    payment_id: payment.id,
    amount: payment.amount,
    account_id: payment.account_id,
    occurred_on: payment.occurred_on,
    paid: paid.toString(),
    pending: new Decimal(state.sale.total).minus(paid).toString(),
  };
  const after = {
    amount,
    account_id: account,
    account_name: destination.name,
    occurred_on: d,
    paid: next.toString(),
    pending: new Decimal(state.sale.total).minus(next).toString(),
  };
  const [debt] = await em.query(
    "SELECT coalesce(sum(s.total),0)-(SELECT coalesce(sum(p.amount),0) FROM sale_payments p JOIN sales x ON x.id=p.sale_id WHERE x.customer_id=$1 AND x.status='active') balance FROM sales s WHERE s.customer_id=$1 AND s.status='active'",
    [state.sale.customer_id],
  );
  const deltas = new Map<number, Decimal>();
  deltas.set(payment.account_id, new Decimal(payment.amount).negated());
  deltas.set(account, (deltas.get(account) || new Decimal(0)).plus(amount));
  const cash = [];
  for (const [id, delta] of deltas) {
    const [a] = await em.query(
      "SELECT a.name,(a.opening_balance+coalesce(sum(e.amount),0))::text balance FROM cash_accounts a LEFT JOIN cash_entries e ON e.account_id=a.id WHERE a.id=$1 GROUP BY a.id",
      [id],
    );
    cash.push({
      account_id: id,
      name: a.name,
      before: a.balance,
      delta: delta.toString(),
      after: new Decimal(a.balance).plus(delta).toString(),
    });
  }
  return {
    preview_token: correctionHash({ state, destination, cash, after }),
    before,
    after,
    cash,
    customer_balance_before: String(debt.balance),
    customer_balance_after: new Decimal(debt.balance)
      .plus(payment.amount)
      .minus(amount)
      .toString(),
  };
}
export async function previewPaymentCorrection(
  saleId: number,
  paymentId: number,
  body: any,
) {
  return db.transaction((em) => preview(em, saleId, paymentId, body));
}
export async function correctPayment(
  saleId: number,
  paymentId: number,
  body: any,
) {
  return correctionTransaction(
    "payment:" + paymentId,
    saleId,
    body,
    false,
    async (em) => {
      await em.query("SELECT id FROM sales WHERE id=$1 FOR UPDATE", [saleId]);
      const p = await preview(em, saleId, paymentId, body);
      if (p.preview_token !== body.preview_token)
        throw new ConflictException(
          "El cobro cambió. Revisá la vista previa y confirmá nuevamente.",
        );
      const state = await paymentState(em, saleId);
      const old = state.payments.find((x: any) => x.id === paymentId);
      const id = await replacePaymentApplication(
        em,
        old,
        new Decimal(p.after.amount).isZero()
          ? null
          : {
              amount: p.after.amount,
              account: p.after.account_id,
              date: p.after.occurred_on,
            },
        saleId,
      );
      return { ...p, payment_id: id };
    },
  );
}
export async function correctionHistory(saleId: number) {
  return db.query(
    "SELECT id,kind,before_state,after_state,created_at FROM sale_corrections WHERE sale_id=$1 ORDER BY id DESC",
    [saleId],
  );
}
