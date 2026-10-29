import { MigrationInterface, QueryRunner } from "typeorm";
export class StorefrontContent1760097600028 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE storefront_revisions(id serial PRIMARY KEY,entries jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE storefront_state(id integer PRIMARY KEY CHECK(id=1),draft_revision_id integer NOT NULL REFERENCES storefront_revisions(id),published_revision_id integer REFERENCES storefront_revisions(id));
 INSERT INTO storefront_revisions DEFAULT VALUES; INSERT INTO storefront_state(id,draft_revision_id) SELECT 1,id FROM storefront_revisions;`);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE storefront_state; DROP TABLE storefront_revisions",
    );
  }
}
