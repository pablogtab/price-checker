import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_REPORT_DATABASE_URL;
test(
  "sales reporting uses historical costs and equal preceding periods",
  { skip: !url },
  async (t) => {
    if (!new URL(url!).pathname.endsWith("_test"))
      throw new Error("Use a disposable _test database");
    process.env.DATABASE_URL = url;
    const { db, connect } = await import("./db");
    const reporting: any = await import("./sales-report");
    await connect();
    try {
      await db.query("TRUNCATE sales,cash_accounts RESTART IDENTITY CASCADE");
      for (const [day, total, cost, status] of [
        ["2026-10-01", "100", "80", "active"],
        ["2026-10-01", "100", null, "active"],
        ["2026-09-30", "50", "45", "active"],
        ["2026-10-02", "999", "1", "annulled"],
      ])
        await db.query(
          "INSERT INTO sales(sold_on,total,subtotal,cost_total,status,request_key,fingerprint) VALUES($1,$2,$2,$3,$4,$5,'fixture')",
          [day, total, cost, status, randomUUID()],
        );
      const result = await reporting.salesReport({
        period: "custom",
        start: "2026-10-01",
        end: "2026-10-02",
      });
      assert.deepEqual(result.period, {
        start: "2026-10-01",
        end: "2026-10-02",
      });
      assert.deepEqual(result.previous_period, {
        start: "2026-09-29",
        end: "2026-09-30",
      });
      assert.deepEqual(result.current, {
        sales: "200",
        profit: "20",
        count: 2,
        margin: "20",
      });
      assert.deepEqual(result.previous, {
        sales: "50",
        profit: "5",
        count: 1,
        margin: "10",
      });
      assert.deepEqual(result.changes, {
        sales: "300",
        profit: "300",
        count: "100",
        margin: "10",
      });
      assert.deepEqual(result.daily, [
        { date: "2026-10-01", sales: "200", profit: "20" },
        { date: "2026-10-02", sales: "0", profit: "0" },
      ]);
      await t.test(
        "rejects invalid custom ranges before querying",
        async () => {
          for (const query of [
            { period: "weekly" },
            { period: "custom" },
            { period: "custom", start: "2026-02-30", end: "2026-03-02" },
            { period: "custom", start: "2026-10-03", end: "2026-10-01" },
            { period: "custom", start: ["2026-10-01"], end: "2026-10-01" },
            { period: "custom", start: "0000-01-01", end: "0000-01-01" },
          ])
            await assert.rejects(
              () => reporting.salesReport(query),
              (error: any) => error.getStatus?.() === 400,
            );
        },
      );
      await t.test(
        "presets use Buenos Aires midnight and cross month and year boundaries",
        async () => {
          const before = await reporting.salesReport(
            {},
            new Date("2026-01-01T02:59:59Z"),
          );
          assert.deepEqual(before.period, {
            start: "2025-12-02",
            end: "2025-12-31",
          });
          assert.deepEqual(before.previous_period, {
            start: "2025-11-02",
            end: "2025-12-01",
          });
          const after = await reporting.salesReport(
            {},
            new Date("2026-01-01T03:00:00Z"),
          );
          assert.deepEqual(after.period, {
            start: "2025-12-03",
            end: "2026-01-01",
          });
          const month = await reporting.salesReport(
            { period: "month" },
            new Date("2026-10-24T15:00:00Z"),
          );
          assert.deepEqual(month.period, {
            start: "2026-10-01",
            end: "2026-10-24",
          });
          assert.deepEqual(month.previous_period, {
            start: "2026-09-07",
            end: "2026-09-30",
          });
          const leap = await reporting.salesReport(
            { period: "month" },
            new Date("2024-03-01T02:00:00Z"),
          );
          assert.deepEqual(leap.period, {
            start: "2024-02-01",
            end: "2024-02-29",
          });
        },
      );
      await t.test(
        "empty ranges retain zero days and undefined percentages and margin",
        async () => {
          const empty = await reporting.salesReport({
            period: "custom",
            start: "2025-01-01",
            end: "2025-01-02",
          });
          assert.deepEqual(empty.current, {
            sales: "0",
            profit: "0",
            count: 0,
            margin: null,
          });
          assert.deepEqual(empty.changes, {
            sales: null,
            profit: null,
            count: null,
            margin: null,
          });
          assert.deepEqual(empty.daily, [
            { date: "2025-01-01", sales: "0", profit: "0" },
            { date: "2025-01-02", sales: "0", profit: "0" },
          ]);
        },
      );
      await t.test(
        "sales with no complete costs retain unavailable profit",
        async () => {
          await db.query(
            "INSERT INTO sales(sold_on,total,subtotal,request_key,fingerprint) VALUES('2026-11-01',100,100,$1,'fixture')",
            [randomUUID()],
          );
          const unknown = await reporting.salesReport({
            period: "custom",
            start: "2026-11-01",
            end: "2026-11-02",
          });
          assert.deepEqual(unknown.current, {
            sales: "100",
            profit: null,
            count: 1,
            margin: null,
          });
          assert.deepEqual(unknown.daily, [
            { date: "2026-11-01", sales: "100", profit: null },
            { date: "2026-11-02", sales: "0", profit: "0" },
          ]);
          assert.equal(unknown.changes.profit, null);
        },
      );
      await t.test(
        "zero sales denominators keep margin unavailable even with a known cost",
        async () => {
          await db.query(
            "INSERT INTO sales(sold_on,total,subtotal,cost_total,request_key,fingerprint) VALUES('2026-12-01',0,0,0,$1,'fixture')",
            [randomUUID()],
          );
          const zero = await reporting.salesReport({
            period: "custom",
            start: "2026-12-01",
            end: "2026-12-01",
          });
          assert.deepEqual(zero.current, {
            sales: "0",
            profit: "0",
            count: 1,
            margin: null,
          });
        },
      );
      await t.test(
        "improving a loss produces a positive profit change",
        async () => {
          for (const [day, cost] of [
            ["2026-08-01", 120],
            ["2026-08-02", 110],
          ])
            await db.query(
              "INSERT INTO sales(sold_on,total,subtotal,cost_total,request_key,fingerprint) VALUES($1,100,100,$2,$3,'fixture')",
              [day, cost, randomUUID()],
            );
          const loss = await reporting.salesReport({
            period: "custom",
            start: "2026-08-02",
            end: "2026-08-02",
          });
          assert.equal(loss.current.profit, "-10");
          assert.equal(loss.previous.profit, "-20");
          assert.equal(loss.changes.profit, "50");
          assert.equal(loss.changes.margin, "10");
        },
      );
      await t.test(
        "fully paid, partially paid, and unpaid sales keep their sale-date performance",
        async () => {
          const { createAccount } = await import("./cash");
          const { collectSale, salesSummary } = await import("./sales");
          const account = await createAccount({
            name: "Report test",
            currency: "ARS",
            opening_balance: "0",
          });
          await collectSale(1, {
            amount: "100",
            account_id: account.id,
            occurred_on: "2026-11-15",
            request_key: randomUUID(),
          });
          await collectSale(2, {
            amount: "25",
            account_id: account.id,
            occurred_on: "2026-11-15",
            request_key: randomUUID(),
          });
          const paid = await reporting.salesReport({
            period: "custom",
            start: "2026-10-01",
            end: "2026-10-02",
          });
          assert.deepEqual(paid, result);
          const collectionDay = await reporting.salesReport({
            period: "custom",
            start: "2026-11-15",
            end: "2026-11-15",
          });
          assert.equal(collectionDay.current.sales, "0");
          assert.equal(collectionDay.current.count, 0);
          const legacy = await salesSummary();
          assert.equal(legacy.paid, "125");
          assert.equal(legacy.count, 7);
          assert.equal(legacy.total, "550");
        },
      );
    } finally {
      await db.destroy();
    }
  },
);
