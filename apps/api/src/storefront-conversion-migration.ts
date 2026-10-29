import { MigrationInterface, QueryRunner } from "typeorm";
export class StorefrontConversion1760097600035 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE storefront_orders ADD COLUMN sale_id integer UNIQUE REFERENCES sales(id), ADD CONSTRAINT storefront_order_conversion CHECK ((status='converted')=(sale_id IS NOT NULL)); CREATE INDEX storefront_orders_inbox ON storefront_orders(status,id DESC);`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      `DROP INDEX storefront_orders_inbox; ALTER TABLE storefront_orders DROP CONSTRAINT storefront_order_conversion, DROP COLUMN sale_id;`,
    );
  }
}
