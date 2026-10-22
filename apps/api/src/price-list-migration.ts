import { MigrationInterface, QueryRunner } from "typeorm";
export class PriceLists1760097600023 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE price_lists(id serial PRIMARY KEY,title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),product_ids integer[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE price_lists");
  }
}
