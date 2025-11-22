import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { db } from './db';
import { integer, money, text } from './catalog';

export async function cashAccounts() {
  return db.query(`SELECT a.*,a.opening_balance::text,(a.opening_balance+coalesce(sum(e.amount),0))::text balance FROM cash_accounts a LEFT JOIN cash_entries e ON e.account_id=a.id GROUP BY a.id ORDER BY a.id`);
}
export async function createAccount(body: any) {
  const name = text(body.name,100), opening = money(body.opening_balance);
  if(!['ARS','USD'].includes(body.currency)) throw new BadRequestException('Moneda inválida');
  const value = new Decimal(opening);
  if(value.decimalPlaces() > 2) throw new BadRequestException('Usá hasta dos decimales para el saldo');
  try {
    const [account] = await db.query('INSERT INTO cash_accounts(name,currency,opening_balance) VALUES($1,$2,$3) RETURNING id',[name,body.currency,opening]);
    return account;
  } catch(e: any) { if(e.code === '23505') throw new ConflictException('Ya existe una cuenta con ese nombre y moneda'); throw e; }
}
export async function setOpeningBalance(id: number, value: any) {
  const amount=money(value);
  if(new Decimal(amount).decimalPlaces()>2) throw new BadRequestException('Usá hasta dos decimales');
  return db.transaction(async em => {
    await em.query('SELECT pg_advisory_xact_lock(713453)');
    const [account]=await em.query('SELECT id FROM cash_accounts WHERE id=$1 FOR UPDATE',[id]);
    if(!account) throw new NotFoundException('Cuenta inexistente');
    const [entry]=await em.query('SELECT id FROM cash_entries WHERE account_id=$1 LIMIT 1',[id]);
    if(entry) throw new BadRequestException('El saldo inicial solo se carga antes del primer movimiento');
    await em.query('UPDATE cash_accounts SET opening_balance=$2 WHERE id=$1',[id,amount]);
    return {id};
  });
}
export async function cashHistory(query: any = {}) {
  const account = query.account_id ? integer(query.account_id) : null;
  return db.query(`SELECT o.id,o.kind,o.occurred_on::text,o.note,o.created_at,
    jsonb_agg(jsonb_build_object('account_id',a.id,'account_name',a.name,'currency',a.currency,'amount',e.amount::text) ORDER BY e.id) entries
    FROM cash_operations o JOIN cash_entries e ON e.operation_id=o.id JOIN cash_accounts a ON a.id=e.account_id
    WHERE ($1::int IS NULL OR EXISTS(SELECT 1 FROM cash_entries f WHERE f.operation_id=o.id AND f.account_id=$1))
    GROUP BY o.id ORDER BY o.occurred_on DESC,o.id DESC LIMIT 100`,[account]);
}
export async function cashOperation(body: any) {
  if(!['income','expense','transfer'].includes(body.kind)) throw new BadRequestException('Movimiento inválido');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.request_key || '')) throw new BadRequestException('Identificador inválido');
  const date = String(body.occurred_on || '');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw new BadRequestException('Fecha inválida');
  const note = text(body.note), amount = money(body.amount,true), account = integer(body.account_id);
  if(new Decimal(amount).decimalPlaces()>2) throw new BadRequestException('Usá hasta dos decimales para el importe');
  const destination = body.kind==='transfer' ? integer(body.destination_id) : null;
  if(account===destination) throw new BadRequestException('Elegí dos cuentas distintas');
  const purchase=body.purchase_id ? integer(body.purchase_id) : null;
  const purchaseAmount=purchase ? money(body.purchase_amount,true) : null;
  const purchaseCurrency=purchase ? body.purchase_currency : null;
  if(purchase && (body.kind!=='expense' || !['ARS','USD'].includes(purchaseCurrency))) throw new BadRequestException('Pago de compra inválido');
  const fingerprint=createHash('sha256').update(JSON.stringify({kind:body.kind,date,note,amount,account,destination,purchase,purchaseAmount,purchaseCurrency})).digest('hex');
  return db.transaction(async em => {
    await em.query('SELECT pg_advisory_xact_lock(713453)');
    const [previous]=await em.query('SELECT id,fingerprint FROM cash_operations WHERE request_key=$1',[body.request_key]);
    if(previous) { if(previous.fingerprint!==fingerprint) throw new ConflictException('El movimiento ya se registró con otros datos'); return {id:previous.id}; }
    const accounts = await em.query('SELECT * FROM cash_accounts WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[[account,...(destination?[destination]:[])]]);
    const source=accounts.find((a:any)=>a.id===account), target=accounts.find((a:any)=>a.id===destination);
    if(!source || (destination && !target)) throw new NotFoundException('Cuenta inexistente');
    if(target && source.currency!==target.currency) throw new BadRequestException('Las transferencias requieren cuentas de la misma moneda');
    if(source.opening_balance==null || (target && target.opening_balance==null)) throw new BadRequestException('Cargá primero el saldo inicial de las cuentas');
    if(purchase) {
      const [invoice]=await em.query('SELECT id FROM purchases WHERE id=$1 FOR UPDATE',[purchase]);
      if(!invoice) throw new NotFoundException('Compra inexistente');
      const [due]=await em.query('SELECT coalesce(sum(total),0)::text total FROM purchase_items WHERE purchase_id=$1 AND currency=$2',[purchase,purchaseCurrency]);
      const [paid]=await em.query('SELECT coalesce(sum(amount),0)::text total FROM purchase_payments WHERE purchase_id=$1 AND currency=$2',[purchase,purchaseCurrency]);
      if(new Decimal(purchaseAmount!).gt(new Decimal(due.total).minus(paid.total))) throw new BadRequestException('El pago supera el saldo pendiente de la compra');
      if(source.currency===purchaseCurrency && !new Decimal(amount).eq(purchaseAmount!)) throw new BadRequestException('El pago y el importe aplicado deben coincidir en la misma moneda');
    }
    if(body.kind!=='income') {
      const [balance]=await em.query('SELECT ($2::numeric+coalesce(sum(amount),0))::text value FROM cash_entries WHERE account_id=$1',[account,source.opening_balance]);
      if(new Decimal(balance.value).lt(amount)) throw new BadRequestException('Saldo insuficiente en la cuenta');
    }
    const [operation]=await em.query('INSERT INTO cash_operations(kind,occurred_on,note,request_key,fingerprint) VALUES($1,$2,$3,$4,$5) RETURNING id',[body.kind,date,note,body.request_key,fingerprint]);
    await em.query('INSERT INTO cash_entries(operation_id,account_id,amount) VALUES($1,$2,$3)',[operation.id,account,body.kind==='income'?amount:new Decimal(amount).neg().toString()]);
    if(destination) await em.query('INSERT INTO cash_entries(operation_id,account_id,amount) VALUES($1,$2,$3)',[operation.id,destination,amount]);
    if(purchase) await em.query('INSERT INTO purchase_payments(purchase_id,operation_id,amount,currency) VALUES($1,$2,$3,$4)',[purchase,operation.id,purchaseAmount,purchaseCurrency]);
    return {id:operation.id};
  });
}
