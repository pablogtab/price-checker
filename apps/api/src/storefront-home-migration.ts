import { MigrationInterface, QueryRunner } from "typeorm";
export class StorefrontHome1760097600031 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE storefront_revisions ADD COLUMN home jsonb NOT NULL DEFAULT '{"featuredIds":[],"banners":[]}'`,
    );
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE storefront_revisions DROP COLUMN home");
  }
}
