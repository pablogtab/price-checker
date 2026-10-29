import { MigrationInterface, QueryRunner } from "typeorm";
export class PresentationPricing1760097600026 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
 CREATE TABLE presentations(id serial PRIMARY KEY,variant_group text UNIQUE,catalog_price numeric CHECK(catalog_price>=0));
 ALTER TABLE products ADD COLUMN presentation_id integer REFERENCES presentations(id);
 INSERT INTO presentations(variant_group,catalog_price) SELECT variant_group,CASE WHEN count(DISTINCT selling_price)=1 THEN min(selling_price) END FROM products WHERE kind='product' AND variant_group IS NOT NULL GROUP BY variant_group;
 UPDATE products p SET presentation_id=r.id FROM presentations r WHERE p.kind='product' AND p.variant_group=r.variant_group;
 DO $$ DECLARE p record; presentation integer; BEGIN FOR p IN SELECT id,selling_price FROM products WHERE kind='product' AND presentation_id IS NULL LOOP
 INSERT INTO presentations(catalog_price) VALUES(p.selling_price) RETURNING id INTO presentation;
 UPDATE products SET presentation_id=presentation WHERE id=p.id; END LOOP; END $$;
 ALTER TABLE products ADD CONSTRAINT product_presentation CHECK(kind<>'product' OR presentation_id IS NOT NULL);
 `);
  }
  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE products DROP CONSTRAINT product_presentation; ALTER TABLE products DROP COLUMN presentation_id; DROP TABLE presentations",
    );
  }
}
