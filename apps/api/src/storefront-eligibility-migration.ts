import { MigrationInterface, QueryRunner } from "typeorm";
/** Unknown supplier inventory must remain distinct from a confirmed zero. */
export class StorefrontEligibility1760097600032 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE supplier_items ALTER COLUMN stock DROP NOT NULL",
    );
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE supplier_items ALTER COLUMN stock SET NOT NULL");
  }
}
