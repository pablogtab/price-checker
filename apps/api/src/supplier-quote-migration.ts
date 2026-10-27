import { MigrationInterface, QueryRunner } from "typeorm";

export class SupplierQuoteMarkup1760097600025 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE settings ADD COLUMN supplier_quote_markup_percent numeric NOT NULL DEFAULT 10 CHECK(supplier_quote_markup_percent >= 0 AND supplier_quote_markup_percent <= 10000)",
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE settings DROP COLUMN supplier_quote_markup_percent",
    );
  }
}
