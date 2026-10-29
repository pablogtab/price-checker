import { MigrationInterface, QueryRunner } from "typeorm";
export class MediaLibrary1760097600027 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE media_assets(id serial PRIMARY KEY, content_hash text NOT NULL UNIQUE CHECK(content_hash ~ '^[a-f0-9]{64}$'), name text NOT NULL, mime text NOT NULL, bytes integer NOT NULL, width integer NOT NULL, height integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE media_asset_usages(asset_id integer NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,owner_type text NOT NULL,owner_id text NOT NULL,slot text NOT NULL,label text NOT NULL,PRIMARY KEY(owner_type,owner_id,slot,asset_id)); CREATE INDEX media_usages_asset ON media_asset_usages(asset_id);`);
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE media_asset_usages,media_assets");
  }
}
