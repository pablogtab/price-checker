import { MigrationInterface, QueryRunner } from "typeorm";
export class StorefrontOrders1760097600034 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE storefront_order_settings (id integer PRIMARY KEY CHECK(id=1), whatsapp_number text NOT NULL DEFAULT ''); INSERT INTO storefront_order_settings(id) VALUES(1);
 CREATE TABLE storefront_orders (
 id bigserial PRIMARY KEY, request_key uuid NOT NULL UNIQUE, fingerprint text NOT NULL, request_payload jsonb NOT NULL,
 receipt_token text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','converted','discarded')),
 snapshot jsonb NOT NULL, fulfillment jsonb NOT NULL, destination text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
 );`);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE storefront_orders; DROP TABLE storefront_order_settings",
    );
  }
}
