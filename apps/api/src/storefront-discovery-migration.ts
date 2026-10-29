import { MigrationInterface, QueryRunner } from "typeorm";
export class StorefrontDiscovery1760097600029 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE storefront_revisions ADD COLUMN categories jsonb NOT NULL DEFAULT '[]', ADD COLUMN brands jsonb NOT NULL DEFAULT '[]'",
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE storefront_revisions DROP COLUMN categories,DROP COLUMN brands",
    );
  }
}
