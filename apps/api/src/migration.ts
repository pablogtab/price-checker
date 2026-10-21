import { MigrationInterface, QueryRunner } from "typeorm";
export class Initial1760097600000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
 CREATE TABLE providers(id serial PRIMARY KEY,name text NOT NULL UNIQUE,adapter text NOT NULL DEFAULT 'coverweb',last_success_at timestamptz);
 CREATE TABLE supplier_items(id serial PRIMARY KEY,provider_id integer NOT NULL REFERENCES providers(id),external_id text NOT NULL,name text NOT NULL,description text NOT NULL DEFAULT '',internal_code text,barcode text,brand text NOT NULL,category text NOT NULL,currency text NOT NULL CHECK(currency IN ('ARS','USD')),price numeric NOT NULL CHECK(price>=0),source_price numeric NOT NULL,stock numeric NOT NULL,is_pack boolean NOT NULL,has_variants boolean NOT NULL,source_updated_at date,available boolean NOT NULL DEFAULT true,seen_at timestamptz NOT NULL,UNIQUE(provider_id,external_id));
 CREATE INDEX supplier_search ON supplier_items(provider_id,available);
 CREATE TABLE products(id serial PRIMARY KEY,name text NOT NULL,code text,barcode text,selling_price numeric NOT NULL DEFAULT 0 CHECK(selling_price>=0),position integer NOT NULL,preferred_provider_id integer REFERENCES providers(id),created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE product_links(id serial PRIMARY KEY,product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,provider_id integer NOT NULL REFERENCES providers(id),individual_item_id integer REFERENCES supplier_items(id),kit_item_id integer REFERENCES supplier_items(id),kit_units integer NOT NULL DEFAULT 7 CHECK(kit_units=7),last_cost numeric,last_currency text,last_basis text,last_item_id integer REFERENCES supplier_items(id),last_cost_at timestamptz,UNIQUE(product_id,provider_id),CHECK(individual_item_id IS NOT NULL OR kit_item_id IS NOT NULL));
 CREATE TABLE settings(id integer PRIMARY KEY CHECK(id=1),usd_ars numeric CHECK(usd_ars>0));
 INSERT INTO settings(id) VALUES(1);
 CREATE TABLE refresh_runs(id serial PRIMARY KEY,provider_id integer NOT NULL REFERENCES providers(id),status text NOT NULL CHECK(status IN ('queued','running','success','failed','session_required')),trigger text NOT NULL,scheduled_for date,started_at timestamptz,finished_at timestamptz,heartbeat_at timestamptz,product_count integer,reported_count integer,pages integer,warning text,error text,created_at timestamptz NOT NULL DEFAULT now());
 CREATE UNIQUE INDEX one_active_refresh ON refresh_runs(provider_id) WHERE status IN ('queued','running');
 CREATE UNIQUE INDEX one_daily_refresh ON refresh_runs(provider_id,scheduled_for) WHERE scheduled_for IS NOT NULL;
 INSERT INTO providers(name) VALUES('Disfit');
 `);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE refresh_runs,settings,product_links,products,supplier_items,providers CASCADE",
    );
  }
}

export class RefreshProgress1760097600001 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query("ALTER TABLE refresh_runs ADD COLUMN progress jsonb");
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE refresh_runs DROP COLUMN progress");
  }
}

export class OwnKits1760097600002 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
    ALTER TABLE products ADD COLUMN kind text NOT NULL DEFAULT 'product' CHECK(kind IN ('product','kit'));
    CREATE TABLE product_components(kit_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,quantity integer NOT NULL CHECK(quantity>0 AND quantity<=1000),PRIMARY KEY(kit_id,product_id),CHECK(kit_id<>product_id));
  `);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE product_components; ALTER TABLE products DROP COLUMN kind",
    );
  }
}

export class PackUnits1760097600003 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE product_links ADD COLUMN individual_units integer NOT NULL DEFAULT 1 CHECK(individual_units>0 AND individual_units<=10000)",
    );
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE product_links DROP COLUMN individual_units");
  }
}

export class KitDiscount1760097600004 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE products ADD COLUMN kit_discount_percent numeric(12,8) NOT NULL DEFAULT 0 CHECK(kit_discount_percent BETWEEN 0 AND 100);
      UPDATE products p SET kit_discount_percent=CASE WHEN b.total>0 THEN
        greatest(0,least(100,ceil((1-p.selling_price/b.total)*100*100000000)/100000000)) ELSE 0 END
      FROM (SELECT c.kit_id,sum(unit.selling_price*c.quantity) total FROM product_components c JOIN products unit ON unit.id=c.product_id GROUP BY c.kit_id) b
      WHERE p.id=b.kit_id AND p.kind='kit';
    `);
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE products DROP COLUMN kit_discount_percent");
  }
}

export class OwnStock1760097600005 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE products ADD COLUMN own_stock integer CHECK(own_stock BETWEEN 0 AND 1000000000);
      CREATE TABLE stock_movements(
        id bigserial PRIMARY KEY,batch_id uuid NOT NULL,
        product_id integer REFERENCES products(id) ON DELETE SET NULL,product_name text NOT NULL,
        type text NOT NULL CHECK(type IN ('set','entry','exit')),quantity bigint NOT NULL,
        previous_stock integer,resulting_stock integer NOT NULL CHECK(resulting_stock>=0),
        note text,kit_id integer REFERENCES products(id) ON DELETE SET NULL,kit_name text,
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX stock_movements_product ON stock_movements(product_id,created_at DESC);
      CREATE INDEX stock_movements_kit ON stock_movements(kit_id,created_at DESC);
    `);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE stock_movements; ALTER TABLE products DROP COLUMN own_stock",
    );
  }
}

export class VariantKits1760097600006 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE products ADD COLUMN variant_group text;
      ALTER TABLE products ADD COLUMN archived boolean NOT NULL DEFAULT false;
      ALTER TABLE product_components ADD COLUMN variant_group text;
      CREATE INDEX product_variant_group ON products(variant_group) WHERE NOT archived;`);
  }
  async down(q: QueryRunner) {
    await q.query(`DROP INDEX product_variant_group; ALTER TABLE product_components DROP COLUMN variant_group;
      ALTER TABLE products DROP COLUMN variant_group,DROP COLUMN archived;`);
  }
}

export class ProductImages1760097600007 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE supplier_items ADD COLUMN image_url text, ADD COLUMN image_path text,
      ADD COLUMN image_attempts integer NOT NULL DEFAULT 0, ADD COLUMN image_next_attempt timestamptz;
      CREATE INDEX supplier_image_queue ON supplier_items(image_next_attempt) WHERE image_url IS NOT NULL AND image_path IS NULL;`);
  }
  async down(q: QueryRunner) {
    await q.query(`DROP INDEX supplier_image_queue; ALTER TABLE supplier_items DROP COLUMN image_url,
      DROP COLUMN image_path,DROP COLUMN image_attempts,DROP COLUMN image_next_attempt;`);
  }
}

export class KitPricingMode1760097600008 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE products ADD COLUMN kit_pricing_mode text NOT NULL DEFAULT 'final' CHECK (kit_pricing_mode IN ('final','discount'));
      UPDATE products p SET selling_price=round((SELECT sum(c.quantity * CASE WHEN c.variant_group IS NULL THEN child.selling_price ELSE (SELECT min(v.selling_price) FROM products v WHERE v.variant_group=c.variant_group AND NOT v.archived AND v.kind='product') END) FROM product_components c JOIN products child ON child.id=c.product_id WHERE c.kit_id=p.id)*(1-p.kit_discount_percent/100)/100)*100 WHERE p.kind='kit' AND NOT p.archived AND EXISTS(SELECT 1 FROM product_components WHERE kit_id=p.id);`);
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE products DROP COLUMN kit_pricing_mode");
  }
}

export class Purchases1760097600009 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE purchases(id serial PRIMARY KEY,provider_id integer NOT NULL REFERENCES providers(id),received_on date NOT NULL,note text,request_key uuid NOT NULL UNIQUE,fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
   CREATE TABLE purchase_items(id serial PRIMARY KEY,purchase_id integer NOT NULL REFERENCES purchases(id),product_id integer NOT NULL REFERENCES products(id),product_name text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),unit_price numeric NOT NULL CHECK(unit_price>=0),currency text NOT NULL CHECK(currency IN ('ARS','USD')),total numeric NOT NULL,previous_stock integer NOT NULL,resulting_stock integer NOT NULL);
   CREATE INDEX purchase_items_purchase ON purchase_items(purchase_id);`);
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE purchase_items; DROP TABLE purchases;");
  }
}

export class Cash1760097600010 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE cash_accounts(id serial PRIMARY KEY,name text NOT NULL,currency text NOT NULL CHECK(currency IN ('ARS','USD')),opening_balance numeric CHECK(opening_balance>=0),created_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX cash_account_name ON cash_accounts(lower(name),currency);
      CREATE TABLE cash_operations(id serial PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('income','expense','transfer')),occurred_on date NOT NULL,note text NOT NULL,request_key uuid NOT NULL UNIQUE,fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE cash_entries(id serial PRIMARY KEY,operation_id integer NOT NULL REFERENCES cash_operations(id),account_id integer NOT NULL REFERENCES cash_accounts(id),amount numeric NOT NULL CHECK(amount<>0));
      CREATE INDEX cash_entries_account ON cash_entries(account_id);
      INSERT INTO cash_accounts(name,currency) VALUES('Efectivo','ARS'),('Transferencia','ARS');
      CREATE TABLE purchase_payments(id serial PRIMARY KEY,purchase_id integer NOT NULL REFERENCES purchases(id),operation_id integer NOT NULL UNIQUE REFERENCES cash_operations(id),amount numeric NOT NULL CHECK(amount>0),currency text NOT NULL CHECK(currency IN ('ARS','USD')));`);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE purchase_payments; DROP TABLE cash_entries; DROP TABLE cash_operations; DROP TABLE cash_accounts;",
    );
  }
}

export class Sales1760097600011 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE customers(id serial PRIMARY KEY,name text NOT NULL,phone text,note text,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE sales(id serial PRIMARY KEY,customer_id integer REFERENCES customers(id),customer_name text,sold_on date NOT NULL,note text,total numeric NOT NULL CHECK(total>=0),cost_total numeric,request_key uuid NOT NULL UNIQUE,fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE sale_items(id serial PRIMARY KEY,sale_id integer NOT NULL REFERENCES sales(id),product_id integer NOT NULL REFERENCES products(id),product_name text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),unit_price numeric NOT NULL CHECK(unit_price>=0),total numeric NOT NULL,cost_total numeric);
      CREATE TABLE sale_components(id serial PRIMARY KEY,sale_item_id integer NOT NULL REFERENCES sale_items(id),product_id integer NOT NULL REFERENCES products(id),product_name text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),unit_cost numeric,previous_stock integer NOT NULL,resulting_stock integer NOT NULL CHECK(resulting_stock>=0));
      CREATE TABLE sale_payments(id serial PRIMARY KEY,sale_id integer NOT NULL REFERENCES sales(id),operation_id integer NOT NULL UNIQUE REFERENCES cash_operations(id),amount numeric NOT NULL CHECK(amount>0));
      CREATE INDEX sales_customer ON sales(customer_id,sold_on,id);
      CREATE INDEX sale_items_sale ON sale_items(sale_id);
      CREATE INDEX sale_payments_sale ON sale_payments(sale_id);`);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE sale_payments; DROP TABLE sale_components; DROP TABLE sale_items; DROP TABLE sales; DROP TABLE customers;",
    );
  }
}

export class NegativeSaleStock1760097600012 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE products DROP CONSTRAINT products_own_stock_check;
      ALTER TABLE products ADD CONSTRAINT products_own_stock_check CHECK(own_stock BETWEEN -1000000000 AND 1000000000);
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_resulting_stock_check;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_resulting_stock_check CHECK(resulting_stock BETWEEN -1000000000 AND 1000000000);
      ALTER TABLE sale_components DROP CONSTRAINT sale_components_resulting_stock_check;
      ALTER TABLE sale_components ADD CONSTRAINT sale_components_resulting_stock_check CHECK(resulting_stock BETWEEN -1000000000 AND 1000000000);`);
  }
  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE products DROP CONSTRAINT products_own_stock_check;
      ALTER TABLE products ADD CONSTRAINT products_own_stock_check CHECK(own_stock BETWEEN 0 AND 1000000000);
      ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_resulting_stock_check;
      ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_resulting_stock_check CHECK(resulting_stock>=0);
      ALTER TABLE sale_components DROP CONSTRAINT sale_components_resulting_stock_check;
      ALTER TABLE sale_components ADD CONSTRAINT sale_components_resulting_stock_check CHECK(resulting_stock>=0);`);
  }
}

export class CustomerInstagram1760097600013 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query("ALTER TABLE customers ADD COLUMN instagram text");
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE customers DROP COLUMN instagram");
  }
}

export class PriceAnalysis1760097600014 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE refresh_runs ADD COLUMN price_analysis jsonb, ADD COLUMN price_changes jsonb",
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE refresh_runs DROP COLUMN price_analysis, DROP COLUMN price_changes",
    );
  }
}

export class NegativeCashBalance1760097600015 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE cash_accounts DROP CONSTRAINT cash_accounts_opening_balance_check",
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE cash_accounts ADD CONSTRAINT cash_accounts_opening_balance_check CHECK(opening_balance>=0)",
    );
  }
}

export class ProductUploads1760097600016 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query("ALTER TABLE products ADD COLUMN custom_image_path text");
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE products DROP COLUMN custom_image_path");
  }
}

export class SupplierPackUnits1760097600017 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE product_links DROP CONSTRAINT product_links_kit_units_check; ALTER TABLE product_links ALTER COLUMN kit_units SET DEFAULT 1; ALTER TABLE product_links ADD CONSTRAINT product_links_kit_units_check CHECK(kit_units BETWEEN 1 AND 10000);",
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE product_links DROP CONSTRAINT product_links_kit_units_check; ALTER TABLE product_links ALTER COLUMN kit_units SET DEFAULT 7; ALTER TABLE product_links ADD CONSTRAINT product_links_kit_units_check CHECK(kit_units=7);",
    );
  }
}

export class MinimumStock1760097600018 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE products ADD COLUMN minimum_stock integer CHECK(minimum_stock BETWEEN 0 AND 1000000000)",
    );
  }
  async down(q: QueryRunner) {
    await q.query("ALTER TABLE products DROP COLUMN minimum_stock");
  }
}

export class CustomerCollections1760097600019 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_operation_id_key; ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_operation_sale_key UNIQUE(operation_id,sale_id); CREATE INDEX sales_customer_date ON sales(customer_id,sold_on,id)",
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP INDEX sales_customer_date; ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_operation_sale_key; ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_operation_id_key UNIQUE(operation_id)",
    );
  }
}

export class SaleCorrections1760097600021 implements MigrationInterface {
 async up(q:QueryRunner):Promise<void>{await q.query(`CREATE TABLE sale_corrections(id serial PRIMARY KEY,sale_id integer NOT NULL REFERENCES sales(id),kind text NOT NULL,request_key uuid NOT NULL UNIQUE,fingerprint text NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX sale_corrections_sale ON sale_corrections(sale_id);`);}
 async down(q:QueryRunner):Promise<void>{await q.query('DROP TABLE sale_corrections');}
}

export class SaleAnnulments1760097600022 implements MigrationInterface {
 async up(q:QueryRunner){await q.query("ALTER TABLE sales ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','annulled')), ADD COLUMN annulled_at timestamptz");}
 async down(q:QueryRunner){await q.query('ALTER TABLE sales DROP COLUMN status,DROP COLUMN annulled_at');}
}
