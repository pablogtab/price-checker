import { MigrationInterface, QueryRunner } from "typeorm";
export class PriceListOrders1760097600024 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE products ADD COLUMN price_list_order_allowed boolean NOT NULL DEFAULT false; ALTER TABLE settings ADD COLUMN price_list_order_days integer NOT NULL DEFAULT 7 CHECK(price_list_order_days BETWEEN 1 AND 365)`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE products DROP COLUMN price_list_order_allowed; ALTER TABLE settings DROP COLUMN price_list_order_days",
    );
  }
}
