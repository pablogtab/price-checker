import { BadRequestException } from "@nestjs/common";
import Decimal from "decimal.js";
import { db } from "./db";

type Range = { start: string; end: string };
type Metrics = {
  sales: string;
  profit: string | null;
  count: number;
  margin: string | null;
};
type Day = {
  date: string;
  sales: string;
  profit: string;
  costed_sales: string;
  count: number;
  costed_count: number;
};

function shift(day: string, offset: number) {
  const value = new Date(day + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function aggregate(days: Day[]): Metrics {
  let sales = new Decimal(0),
    profit = new Decimal(0),
    costedSales = new Decimal(0),
    count = 0,
    costedCount = 0;
  for (const day of days) {
    sales = sales.plus(day.sales);
    profit = profit.plus(day.profit);
    costedSales = costedSales.plus(day.costed_sales);
    count += day.count;
    costedCount += day.costed_count;
  }
  return {
    sales: sales.toString(),
    profit: count > 0 && costedCount === 0 ? null : profit.toString(),
    count,
    margin: costedSales.isZero()
      ? null
      : profit.div(costedSales).mul(100).toDecimalPlaces(2).toString(),
  };
}

function percent(
  current: string | number | null,
  previous: string | number | null,
) {
  if (current === null || previous === null || new Decimal(previous).isZero())
    return null;
  // An absolute denominator preserves the direction of an improvement from a loss.
  return new Decimal(current)
    .minus(previous)
    .div(new Decimal(previous).abs())
    .mul(100)
    .toDecimalPlaces(2)
    .toString();
}

/** Public reporting boundary. The clock argument keeps calendar presets deterministic. */
export async function salesReport(
  query: { period?: unknown; start?: unknown; end?: unknown } = {},
  now = new Date(),
) {
  const preset = query.period ?? "last30";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  let period: Range;
  if (preset === "last30") period = { start: shift(today, -29), end: today };
  else if (preset === "month")
    period = { start: today.slice(0, 8) + "01", end: today };
  else if (preset === "custom") {
    const valid = (v: unknown): v is string =>
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      v >= "0001-01-01" &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v;
    if (!valid(query.start) || !valid(query.end) || query.start > query.end)
      throw new BadRequestException("Elegí un rango de fechas válido");
    period = { start: query.start, end: query.end };
  } else throw new BadRequestException("Período inválido");
  const length =
    Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000) +
    1;
  const previous_period = {
    start: shift(period.start, -length),
    end: shift(period.start, -1),
  };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(previous_period.start) ||
    previous_period.start < "0001-01-01"
  )
    throw new BadRequestException(
      "El rango debe permitir un período anterior válido",
    );
  const days: Day[] = await db.query(
    `
    SELECT to_char(d.day,'YYYY-MM-DD') date,
      coalesce(sum(s.total),0)::text sales,
      coalesce(sum(s.total-s.cost_total) FILTER(WHERE s.cost_total IS NOT NULL),0)::text profit,
      coalesce(sum(s.total) FILTER(WHERE s.cost_total IS NOT NULL),0)::text costed_sales,
      count(s.id)::int count,
      count(s.id) FILTER(WHERE s.cost_total IS NOT NULL)::int costed_count
    FROM generate_series($1::date,$2::date,interval '1 day') d(day)
    LEFT JOIN sales s ON s.sold_on=d.day::date AND s.status='active'
    GROUP BY d.day ORDER BY d.day`,
    [previous_period.start, period.end],
  );
  const selected = days.filter((day) => day.date >= period.start);
  const current = aggregate(selected),
    previous = aggregate(days.filter((day) => day.date < period.start));
  return {
    period,
    previous_period,
    current,
    previous,
    changes: {
      sales: percent(current.sales, previous.sales),
      profit: percent(current.profit, previous.profit),
      count: percent(current.count, previous.count),
      margin:
        current.margin === null || previous.margin === null
          ? null
          : new Decimal(current.margin)
              .minus(previous.margin)
              .toDecimalPlaces(2)
              .toString(),
    },
    daily: selected.map((day) => ({
      date: day.date,
      sales: new Decimal(day.sales).toString(),
      profit:
        day.count > 0 && day.costed_count === 0
          ? null
          : new Decimal(day.profit).toString(),
    })),
  };
}
