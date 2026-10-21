import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "./db";
import { integer } from "./catalog";
import { ars, date, key, sales } from "./sales";

const aggregate = `SELECT c.*,coalesce(s.sold,0)::text sold,coalesce(p.paid,0)::text paid,
 (coalesce(s.sold,0)-coalesce(p.paid,0))::text balance,coalesce(s.sale_count,0)::int sale_count,s.last_sale::text
 FROM customers c LEFT JOIN LATERAL(SELECT sum(total) sold,count(*) sale_count,max(sold_on) last_sale FROM sales WHERE customer_id=c.id AND status='active') s ON true
 LEFT JOIN LATERAL(SELECT sum(sp.amount) paid FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id WHERE s.customer_id=c.id AND s.status='active') p ON true`;
function pageOf(q: any) {
  return q.page == null ? 1 : integer(q.page);
}
const hash = (value: any) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function customerDetail(id: number) {
  const [row] = await db.query(`${aggregate} WHERE c.id=$1`, [id]);
  if (!row) throw new NotFoundException("Cliente inexistente");
  return row;
}
export async function customerSearch(q: any) {
  const page = pageOf(q),
    status = q.status || "all";
  if (!["all", "debt", "settled", "new"].includes(status))
    throw new BadRequestException("Filtro inválido");
  const sorts: Record<string, string> = {
    name: "lower(name)",
    balance: "balance::numeric",
    last_sale: "last_sale::date",
    sold: "sold::numeric",
    sale_count: "sale_count",
  };
  const sort = Object.hasOwn(sorts, q.sort || "name")
    ? sorts[q.sort || "name"]
    : null;
  if (!sort || (q.direction && !["asc", "desc"].includes(q.direction)))
    throw new BadRequestException("Orden inválido");
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const terms = norm(String(q.search || "").slice(0, 200))
    .split(/\s+/)
    .filter(Boolean);
  // Normalize contact punctuation too, so pasted telephone numbers match formatted contacts.
  const normalizeSQL = `translate(lower(concat_ws(' ',name,phone,instagram)),'áéíóúüñ','aeiouun')`;
  const filters = terms.map(
    (_, i) =>
      `(strpos(${normalizeSQL},$${i + 1})>0 OR ($${i + 1} ~ '^[0-9+().-]+$' AND regexp_replace($${i + 1},'[^0-9]','','g')<>'' AND strpos(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),regexp_replace($${i + 1},'[^0-9]','','g'))>0))`,
  );
  if (status === "debt") filters.push("balance::numeric>0");
  if (status === "settled") filters.push("balance::numeric=0 AND sale_count>0");
  if (status === "new") filters.push("sale_count=0");
  const where = filters.length ? " WHERE " + filters.join(" AND ") : "";
  const [summary] = await db.query(
    `WITH clients AS (${aggregate}) SELECT count(*)::int customers,count(*) FILTER(WHERE balance::numeric>0)::int debtors,coalesce(sum(balance::numeric),0)::text receivable FROM clients`,
  );
  const [count] = await db.query(
    `WITH clients AS (${aggregate}) SELECT count(*)::int total FROM clients${where}`,
    terms,
  );
  const items = await db.query(
    `WITH clients AS (${aggregate}) SELECT * FROM clients${where} ORDER BY ${sort} ${q.direction === "desc" ? "DESC" : "ASC"} NULLS LAST,id ASC LIMIT 25 OFFSET $${terms.length + 1}`,
    [...terms, (page - 1) * 25],
  );
  return { items, total: count.total, page, size: 25, summary };
}
export async function customerSales(id: number, q: any) {
  await customerDetail(id);
  const [count] = await db.query(
    "SELECT count(*)::int total FROM sales WHERE customer_id=$1",
    [id],
  );
  const page = pageOf(q);
  return {
    items: await sales({ customer_id: id, page }),
    total: count.total,
    page,
    size: 25,
  };
}
export async function customerLedger(id: number, q: any) {
  await customerDetail(id);
  const page = pageOf(q);
  const cte = `WITH events AS (
 SELECT 'sale' kind,s.id,s.id sale_id,s.sold_on occurred_on,s.created_at,CASE WHEN s.status='annulled' THEN 0 ELSE s.total END debit,0::numeric credit,(CASE WHEN s.status='annulled' THEN 'Venta anulada #' ELSE 'Venta #' END)||s.id concept FROM sales s WHERE s.customer_id=$1
 UNION ALL
 SELECT 'payment',o.id,NULL::int,o.occurred_on,o.created_at,0::numeric,sum(p.amount),coalesce(o.note,'Cobro') FROM sale_payments p JOIN sales s ON s.id=p.sale_id JOIN cash_operations o ON o.id=p.operation_id WHERE s.customer_id=$1 AND s.status='active' GROUP BY o.id
 ),ledger AS(SELECT *,sum(debit-credit) OVER(ORDER BY occurred_on,created_at,kind DESC,id ROWS UNBOUNDED PRECEDING) balance FROM events)`;
  const [count] = await db.query(
    `${cte} SELECT count(*)::int total FROM ledger`,
    [id],
  );
  const items = await db.query(
    `${cte} SELECT *,occurred_on::text,debit::text,credit::text,balance::text FROM ledger ORDER BY ledger.occurred_on DESC,created_at DESC,kind ASC,id DESC LIMIT 25 OFFSET $2`,
    [id, (page - 1) * 25],
  );
  return { items, total: count.total, page, size: 25 };
}
async function allocation(em: any, id: number, amount: string) {
  const [customer] = await em.query("SELECT id FROM customers WHERE id=$1", [
    id,
  ]);
  if (!customer) throw new NotFoundException("Cliente inexistente");
  const rows = await em.query(
    `SELECT s.id,s.sold_on::text,(s.total-coalesce(p.paid,0))::text pending FROM sales s LEFT JOIN LATERAL(SELECT sum(amount) paid FROM sale_payments WHERE sale_id=s.id) p ON true WHERE customer_id=$1 AND s.status='active' AND s.total>coalesce(p.paid,0) ORDER BY s.sold_on,s.id`,
    [id],
  );
  const debt = rows.reduce(
    (a: Decimal, r: any) => a.plus(r.pending),
    new Decimal(0),
  );
  if (new Decimal(amount).gt(debt))
    throw new BadRequestException(
      "El cobro supera el saldo pendiente del cliente",
    );
  let remaining = new Decimal(amount);
  const allocations = rows.flatMap((r: any) => {
    if (remaining.isZero()) return [];
    const applied = Decimal.min(remaining, r.pending);
    remaining = remaining.minus(applied);
    return [
      {
        sale_id: r.id,
        sold_on: r.sold_on,
        pending: r.pending,
        amount: applied.toString(),
        remaining: new Decimal(r.pending).minus(applied).toString(),
      },
    ];
  });
  return {
    allocations,
    balance: debt.toString(),
    remaining: debt.minus(amount).toString(),
    token: hash({ id, amount, rows }),
  };
}
export async function previewCustomerPayment(id: number, body: any) {
  const amount = ars(body.amount, true);
  return db.transaction(async (em) => {
    await em.query("SELECT pg_advisory_xact_lock(713453)");
    return allocation(em, id, amount);
  });
}
export async function collectCustomer(id: number, body: any) {
  const amount = ars(body.amount, true),
    account = integer(body.account_id),
    d = date(body.occurred_on),
    k = key(body.request_key);
  const fingerprint = hash({ customer: id, amount, account, date: d });
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
    const preview = await allocation(em, id, amount);
    if (body.preview_token !== preview.token)
      throw new ConflictException(
        "El saldo cambió. Revisá la distribución y confirmá nuevamente.",
      );
    const [a] = await em.query(
      "SELECT * FROM cash_accounts WHERE id=$1 FOR UPDATE",
      [account],
    );
    if (!a || a.currency !== "ARS" || a.opening_balance == null)
      throw new BadRequestException(
        "Elegí una cuenta en ARS con saldo inicial cargado",
      );
    const [op] = await em.query(
      "INSERT INTO cash_operations(kind,occurred_on,note,request_key,fingerprint) VALUES('income',$1,$2,$3,$4) RETURNING id",
      [d, "Cobro de cliente #" + id, k, fingerprint],
    );
    await em.query(
      "INSERT INTO cash_entries(operation_id,account_id,amount) VALUES($1,$2,$3)",
      [op.id, account, amount],
    );
    for (const p of preview.allocations)
      await em.query(
        "INSERT INTO sale_payments(sale_id,operation_id,amount) VALUES($1,$2,$3)",
        [p.sale_id, op.id, p.amount],
      );
    return { id: op.id };
  });
}
