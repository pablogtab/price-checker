import { test } from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
// Integration tests require an explicit, disposable database. Never reset the app database.
const url = process.env.TEST_DATABASE_URL;
test(
  "PostgreSQL imports, costs, filters, ordering, and jobs",
  { skip: !url },
  async () => {
    if (!new URL(url!).pathname.endsWith("_test"))
      throw new Error(
        "TEST_DATABASE_URL debe apuntar a una base terminada en _test",
      );
    process.env.DATABASE_URL = url;
    const { db, connect } = await import("./db");
    const { importSnapshot } = await import("./catalog");
    const { AppService } = await import("./service");
    await connect();
    try {
      await db.query(
        "TRUNCATE refresh_runs,product_links,products,presentations,supplier_items,cash_accounts,purchases,customers,sales RESTART IDENTITY CASCADE",
      );
      await db.query("DELETE FROM providers WHERE id<>1");
      const snapshot = JSON.parse(
        await readFile(
          resolve(process.cwd(), "../../data/disfit-prices.json"),
          "utf8",
        ),
      );
      const service = new AppService();
      await importSnapshot(snapshot, 1);
      await importSnapshot(snapshot, 1);
      const [count] = await db.query(
        "SELECT count(*)::int n FROM supplier_items",
      );
      assert.equal(count.n, 2688);
      const imported = await db.query(
        "SELECT external_id,barcode,price::text,currency FROM supplier_items",
      );
      for (const item of imported) {
        const source = snapshot.products.find(
          (p: any) => p.id === item.external_id,
        );
        assert(source);
        assert.equal(item.barcode, source.barcode);
        assert.equal(item.price, source.price.amount);
        assert.equal(item.currency, source.price.currency);
      }
      const multiTerm = await service.catalog({
        search: "CREATINA DOYPACK NEUTRA",
        kind: "individual",
      });
      assert(multiTerm.total > 0);
      assert(
        multiTerm.items.every((i: any) =>
          ["creatina", "doypack", "neutra"].every((term) =>
            i.name.toLowerCase().includes(term),
          ),
        ),
      );

      const [barcode] = await db.query(
        "SELECT barcode,price::text,currency FROM supplier_items WHERE external_id='1026419'",
      );
      assert.equal(barcode.barcode, "7792981072895");
      assert.equal(barcode.price, "12464.28");
      const catalog = await service.catalog({
        currency: "USD",
        stock: "in",
        search: "creatina",
      });
      assert(catalog.items.length > 0);
      assert(
        catalog.items.every(
          (i: any) => i.currency === "USD" && Number(i.stock) > 0,
        ),
      );
      const categories = (
        await db.query(
          "SELECT DISTINCT category FROM supplier_items WHERE brand IN ('STAR NUTRITION','ENA LAB') AND category IS NOT NULL ORDER BY category LIMIT 2",
        )
      ).map((r: any) => r.category);
      assert.equal(categories.length, 2);
      const combined = await service.catalog({
        provider: ["1"],
        brand: ["STAR NUTRITION", "ENA LAB"],
        category: categories,
        currency: ["ARS", "USD"],
        stock: ["in", "out"],
        linked: ["yes", "no"],
        size: 100,
      });
      const [expected] = await db.query(
        "SELECT count(*)::int total FROM supplier_items WHERE available AND provider_id=1 AND brand=ANY($1::text[]) AND category=ANY($2::text[]) AND currency IN ('ARS','USD') AND stock IS NOT NULL",
        [["STAR NUTRITION", "ENA LAB"], categories],
      );
      assert.equal(combined.total, expected.total);
      assert(combined.total > 0);
      assert(
        combined.items.every(
          (i: any) =>
            ["STAR NUTRITION", "ENA LAB"].includes(i.brand) &&
            categories.includes(i.category),
        ),
      );
      assert.equal(
        (
          await service.catalog({
            brand: ["STAR NUTRITION", "' OR 1=1 --"],
            category: categories,
          })
        ).total,
        (
          await service.catalog({
            brand: "STAR NUTRITION",
            category: categories,
          })
        ).total,
      );
      await assert.rejects(
        service.catalog({ currency: ["ARS", "EUR"] }),
        /Moneda/,
      );
      await assert.rejects(service.catalog({ provider: ["1", "invalid"] }));
      const kits = await service.catalog({ kind: "kit", size:100 });
      assert.equal(kits.total, (await db.query("SELECT count(*)::int n FROM supplier_items WHERE available AND is_pack"))[0].n);
      const [jarOffer] = await db.query(
        "SELECT id FROM supplier_items WHERE external_id='202796'",
      );
      const bag = await service.createProduct({
        name: "STAR Premium DOYPACK 2 LB",
        selling_price: "68000",
      });
      await assert.rejects(
        service.saveLink(bag.id, {
          provider_id: 1,
          individual_item_id: jarOffer.id,
        }),
        /envase/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM product_links WHERE product_id=$1",
            [bag.id],
          )
        )[0].n,
        0,
      );
      await assert.rejects(
        service.createProduct({
          name: "STAR DOYPACK",
          source_item_id: jarOffer.id,
        }),
        /envase/,
      );
      await service.deleteProduct(bag.id);
      const p = await service.createProduct({
        name: "Creatina prueba",
        selling_price: "30000",
        barcode: "000123",
      });
      const [kit] = await db.query("SELECT * FROM supplier_items WHERE external_id='949685' AND provider_id=1");
      assert(kit);
      const individuals = await service.catalog({
        kind: "individual",
        search: "creatina",
      });
      const individual = individuals.items.find(
        (i: any) => i.external_id === "823150",
      );
      assert(individual);
      await assert.rejects(
        service.saveLink(p.id, {
          provider_id: 1,
          kit_item_id: kit.id,
          individual_item_id: individual.id,
        }),
      );
      await service.saveLink(p.id, {
        provider_id: 1,
        kit_item_id: kit.id,
        individual_item_id: individual.id,
        matches_confirmed: true,
      });
      let product = (await service.products())[0];
      assert.equal(product.selected.cost.basis, "kit");
      assert.equal(product.barcode, "000123");
      const before = product.selected.cost.amount;
      const noKit = {
        ...snapshot,
        products: snapshot.products.filter(
          (x: any) => x.id !== kit.external_id,
        ),
      };
      noKit.product_count = noKit.products.length;
      noKit.currencies = {
        ARS: noKit.products.filter((x: any) => x.price.currency === "ARS")
          .length,
        USD: noKit.products.filter((x: any) => x.price.currency === "USD")
          .length,
      };
      await importSnapshot(noKit, 1);
      product = (await service.products())[0];
      assert.equal(product.selected.cost.basis, "individual");
      assert.equal(product.selling_price, "30000");
      const neither = {
        ...noKit,
        products: noKit.products.filter(
          (x: any) => x.id !== individual.external_id,
        ),
      };
      neither.product_count = neither.products.length;
      neither.currencies = {
        ARS: neither.products.filter((x: any) => x.price.currency === "ARS")
          .length,
        USD: neither.products.filter((x: any) => x.price.currency === "USD")
          .length,
      };
      await importSnapshot(neither, 1);
      product = (await service.products())[0];
      assert.equal(product.selected.cost.stale, true);
      const oldCount = (
        await db.query(
          "SELECT count(*)::int n FROM supplier_items WHERE available",
        )
      )[0].n;
      await assert.rejects(
        importSnapshot({ ...snapshot, product_count: 99999 }, 1),
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM supplier_items WHERE available",
          )
        )[0].n,
        oldCount,
      );
      await importSnapshot(snapshot, 1);
      assert.equal((await service.products())[0].selected.cost.amount, before);
      await service.saveSettings({ usd_ars: "1200" });
      await assert.rejects(service.saveSettings({ usd_ars: "-1" }));
      const p2 = await service.createProduct({
        name: "Segundo",
        selling_price: "0",
      });
      await service.order({ ids: [p2.id, p.id] });
      assert.equal((await service.products())[0].id, p2.id);
      await assert.rejects(service.order({ ids: [p.id] }));
      await service.editProduct(p.id, {
        name: "Nombre editado",
        barcode: "000123",
        selling_price: "35000",
        preferred_provider_id: 1,
      });
      await Promise.all(Array.from({ length: 8 }, () => service.refresh(1)));
      const active = await db.query(
        "SELECT * FROM refresh_runs WHERE status IN ('queued','running')",
      );
      assert.equal(active.length, 1);
      const fixture = await mkdtemp(join(tmpdir(), "price-checker-test-"));
      try {
        const { processRun, claimJob, recoverInterrupted, schedule } =
          await import("./worker");
        const claimed = await claimJob();
        assert.equal(claimed.id, active[0].id);
        assert.equal(await claimJob(), null);
        await recoverInterrupted();
        assert.equal(
          (
            await db.query("SELECT status FROM refresh_runs WHERE id=$1", [
              claimed.id,
            ])
          )[0].status,
          "queued",
        );
        await claimJob();
        await writeFile(
          join(fixture, "scraper.py"),
          "import sys\nprint('Error: Session expired. Run login',file=sys.stderr)\nsys.exit(1)\n",
        );
        await db.query("UPDATE refresh_runs SET status='running' WHERE id=$1", [
          active[0].id,
        ]);
        await processRun(active[0], fixture, "python3");
        assert.equal(
          (
            await db.query("SELECT status FROM refresh_runs WHERE id=$1", [
              active[0].id,
            ])
          )[0].status,
          "session_required",
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM supplier_items WHERE available",
            )
          )[0].n,
          2688,
        );
        assert.equal(
          (await service.products()).find((x: any) => x.id === p.id)
            .selling_price,
          "35000",
        );
        await writeFile(
          join(fixture, "scraper.py"),
          "import sys,json\njson.dump({'products':[]},open(sys.argv[sys.argv.index('--output')+1],'w'))\n",
        );
        const badRun = await service.refresh(1);
        await processRun(badRun, fixture, "python3");
        assert.equal(
          (
            await db.query("SELECT status FROM refresh_runs WHERE id=$1", [
              badRun.id,
            ])
          )[0].status,
          "failed",
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM supplier_items WHERE available",
            )
          )[0].n,
          2688,
        );
        await writeFile(
          join(fixture, "snapshot.json"),
          JSON.stringify(snapshot),
        );
        await writeFile(
          join(fixture, "scraper.py"),
          "import sys,shutil,os\nprint('Page 229/229: 2688/2741 products', flush=True)\nshutil.copyfile(os.path.join(os.path.dirname(__file__),'snapshot.json'),sys.argv[sys.argv.index('--output')+1])\n",
        );
        const successful = await service.refresh(1);
        const successfulClaim = await claimJob();
        await processRun(successfulClaim, fixture, "python3");
        const [result] = await db.query(
          "SELECT * FROM refresh_runs WHERE id=$1",
          [successful.id],
        );
        assert.equal(result.status, "success");
        assert.equal(result.progress.page, 229);
        assert.equal(result.progress.products, 2688);
        assert.equal(result.progress.phase, "importing");
        assert.equal(result.product_count, 2688);
        assert(result.warning);
        assert.equal(
          (await service.products()).find((x: any) => x.id === p.id)
            .selling_price,
          "35000",
        );
      } finally {
        await rm(fixture, { recursive: true, force: true });
      }
      const { schedule } = await import("./worker");
      await schedule({ date: "2030-01-01", hour: 10 });
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM refresh_runs WHERE scheduled_for='2030-01-01'",
          )
        )[0].n,
        0,
      );
      await schedule({ date: "2030-01-01", hour: 11 });
      await schedule({ date: "2030-01-01", hour: 12 });
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM refresh_runs WHERE scheduled_for='2030-01-01'",
          )
        )[0].n,
        1,
      );
      const [boxOffer] = await db.query(
        "SELECT id FROM supplier_items WHERE external_id='886453'",
      );
      const bar = await service.createProduct({
        name: "Barra desde caja",
        selling_price: "2300",
      });
      await assert.rejects(
        service.saveLink(bar.id, {
          provider_id: 1,
          individual_item_id: boxOffer.id,
          individual_units: 16,
        }),
        /Confirmá/,
      );
      await service.saveLink(bar.id, {
        provider_id: 1,
        individual_item_id: boxOffer.id,
        individual_units: 16,
        pack_confirmed: true,
      });
      assert.equal(
        (await service.products()).find((x: any) => x.id === bar.id).selected
          .costArs,
        "1477.236875",
      );
      const box = await service.createProduct({
        name: "Caja completa",
        selling_price: "28500",
      });
      await service.saveLink(box.id, {
        provider_id: 1,
        individual_item_id: boxOffer.id,
        individual_units: 1,
        pack_confirmed: true,
      });
      assert.equal(
        (await service.products()).find((x: any) => x.id === box.id).selected
          .costArs,
        "23635.79",
      );
      const ownKit = await service.createProduct({
        name: "Promo creatina x2",
        kind: "kit",
        kit_discount_percent: "10",
        components: [{ product_id: p.id, quantity: 2 }],
      });
      const kitView = (await service.products()).find(
        (x: any) => x.id === ownKit.id,
      );
      assert.equal(kitView.components[0].quantity, 2);
      assert.equal(kitView.selected.cost.basis, "assembled");
      assert.equal(kitView.kit_base_price, "70000");
      assert.equal(kitView.selling_price, "63000");
      assert.equal(
        kitView.selected.costArs,
        "35634.06285714285714285714285714285714286",
      );
      await assert.rejects(
        service.deleteProduct(p.id),
        /forma parte de un kit/,
      );
      await assert.rejects(
        service.createProduct({
          name: "Inválido",
          kind: "kit",
          components: [{ product_id: ownKit.id, quantity: 1 }],
        }),
        /individuales/,
      );
      await assert.rejects(
        service.editProduct(ownKit.id, {
          name: "Inválido",
          selling_price: "1",
          components: [{ product_id: p.id, quantity: 0 }],
        }),
      );
      assert.equal(
        (await service.products()).find((x: any) => x.id === ownKit.id)
          .selling_price,
        "63000",
      );
      await service.editProduct(ownKit.id, {
        name: "Promo x3",
        kit_discount_percent: "20",
        components: [{ product_id: p.id, quantity: 3 }],
      });
      assert.equal(
        (await service.products()).find((x: any) => x.id === ownKit.id)
          .selling_price,
        "84000",
      );
      await assert.rejects(
        service.editProduct(ownKit.id, {
          name: "Bad discount",
          kit_discount_percent: "101",
          components: [{ product_id: p.id, quantity: 4 }],
        }),
        /descuento/,
      );
      await service.editProduct(p.id, {
        name: "Nombre editado",
        selling_price: "36000",
        barcode: "000123",
      });
      const updatedKit = (await service.products()).find(
        (x: any) => x.id === ownKit.id,
      );
      assert.equal(updatedKit.selling_price, "86400");
      assert.equal(updatedKit.kit_discount_percent, "20.00000000");
      assert.equal(updatedKit.components[0].quantity, 3);
      assert.equal(
        updatedKit.selected.profit,
        "32948.90571428571428571428571428571428571",
      );
      await db.destroy();
      await connect();
      assert.equal(
        (await service.products()).find((x: any) => x.id === ownKit.id)
          .components[0].quantity,
        3,
      );
      product = (await service.products()).find((x: any) => x.id === p.id);
      assert.equal(product.name, "Nombre editado");
      assert.equal(product.selling_price, "36000");
      assert.equal(product.barcode, "000123");
      assert.equal((await service.products())[0].id, p2.id);
      assert.equal((await service.settings()).usd_ars, "1200");
      const { changeStock, stockHistory, setRealStock } =
        await import("./inventory");
      assert.equal(
        (await service.products()).find((x: any) => x.id === p.id).own_stock,
        null,
      );
      await assert.rejects(
        changeStock(p.id, { type: "entry", quantity: 1 }),
        /Primero/,
      );
      await changeStock(p.id, {
        type: "set",
        quantity: 12,
        note: "Recuento inicial",
      });
      await changeStock(bar.id, { type: "set", quantity: 5 });
      const mixed = await service.createProduct({
        name: "Kit para stock",
        kind: "kit",
        components: [
          { product_id: p.id, quantity: 2 },
          { product_id: bar.id, quantity: 1 },
        ],
      });
      const stockOf = async (id: number) =>
        (await service.products()).find((x: any) => x.id === id).own_stock;
      assert.equal(await stockOf(mixed.id), 5);
      await assert.rejects(
        changeStock(mixed.id, { type: "set", quantity: 5 }),
        /componentes/,
      );
      const exit = await changeStock(mixed.id, {
        type: "exit",
        quantity: 2,
        note: "Salida de prueba",
      });
      assert.equal(await stockOf(p.id), 8);
      assert.equal(await stockOf(bar.id), 3);
      assert.equal(await stockOf(mixed.id), 3);
      const historyBefore = await stockHistory(mixed.id);
      assert.equal(historyBefore.length, 2);
      assert(
        historyBefore.every(
          (m: any) =>
            m.batch_id === exit.batch_id && m.kit_name === "Kit para stock",
        ),
      );
      await assert.rejects(
        changeStock(mixed.id, { type: "exit", quantity: 4 }),
        /insuficiente/,
      );
      assert.equal(await stockOf(p.id), 8);
      assert.equal(await stockOf(bar.id), 3);
      assert.equal((await stockHistory(mixed.id)).length, 2);
      const competing = await Promise.allSettled([
        changeStock(mixed.id, { type: "exit", quantity: 2 }),
        changeStock(mixed.id, { type: "exit", quantity: 2 }),
      ]);
      assert.equal(competing.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(await stockOf(p.id), 4);
      assert.equal(await stockOf(bar.id), 1);
      await changeStock(p.id, { type: "entry", quantity: 3 });
      await changeStock(p.id, { type: "exit", quantity: 2 });
      assert.equal(await stockOf(p.id), 5);
      await changeStock(p.id, { type: "set", quantity: 0 });
      assert.equal(await stockOf(mixed.id), 0);
      const latest = (await stockHistory(p.id))[0];
      assert.equal(latest.previous_stock, 5);
      assert.equal(latest.resulting_stock, 0);
      for (const invalid of [-1, 1.5, null, ""])
        await assert.rejects(
          changeStock(p.id, { type: "set", quantity: invalid }),
        );
      await importSnapshot(snapshot, 1);
      assert.equal(await stockOf(p.id), 0);
      assert.equal(await stockOf(bar.id), 1);
      await db.destroy();
      await connect();
      assert.equal(await stockOf(p.id), 0);
      assert.equal(await stockOf(bar.id), 1);
      assert.equal((await stockHistory(p.id))[0].id, latest.id);

      const vanilla = await service.createProduct({
        name: "Proteína bolsa · Vainilla",
        selling_price: "1000",
        variant_group: "Proteína bolsa",
      });
      const chocolate = await service.createProduct({
        name: "Proteína bolsa · Chocolate",
        selling_price: "1200",
        variant_group: "Proteína bolsa",
      });
      const proteinVariants = (await service.products()).filter((product: any) =>
        [vanilla.id, chocolate.id].includes(product.id),
      );
      assert.equal(proteinVariants.length, 2);
      for (const variant of proteinVariants) {
        assert.equal(variant.selling_price, "1000");
        assert.equal(variant.catalog_price, "1000");
        assert.equal(variant.price_unresolved, false);
      }
      assert.equal(
        proteinVariants[0].presentation_id,
        proteinVariants[1].presentation_id,
      );
      await changeStock(vanilla.id, { type: "set", quantity: 8 });
      await changeStock(chocolate.id, { type: "set", quantity: 4 });
      const flexible = await service.createProduct({
        name: "Proteína x2",
        kind: "kit",
        kit_discount_percent: "10",
        components: [{ variant_group: "Proteína bolsa", quantity: 2 }],
      });
      let familyKit = (await service.products()).find(
        (x: any) => x.id === flexible.id,
      );
      assert.equal(familyKit.own_stock, 6);
      assert.equal(familyKit.selling_price, "1800");
      assert.equal(familyKit.selling_price_max, "1800"); // 2 × common 1000 less 10%, for every flavor choice.
      assert.equal(familyKit.selected.profit, null);
      assert.equal(familyKit.components[0].variants.length, 2);
      const componentId = familyKit.components[0].product_id;
      await assert.rejects(
        changeStock(flexible.id, { type: "exit", quantity: 1 }),
        /sabores/,
      );
      await assert.rejects(
        changeStock(flexible.id, {
          type: "exit",
          quantity: 1,
          selections: [
            {
              component_product_id: componentId,
              product_id: p.id,
              quantity: 2,
            },
          ],
        }),
        /corresponde/,
      );
      await assert.rejects(
        changeStock(flexible.id, {
          type: "exit",
          quantity: 1,
          selections: [
            {
              component_product_id: componentId,
              product_id: vanilla.id,
              quantity: 1,
            },
          ],
        }),
        /cantidades/,
      );
      const choices = [
        {
          component_product_id: componentId,
          product_id: vanilla.id,
          quantity: 1,
        },
        {
          component_product_id: componentId,
          product_id: chocolate.id,
          quantity: 1,
        },
      ];
      await changeStock(flexible.id, {
        type: "exit",
        quantity: 3,
        selections: choices,
      });
      assert.equal(await stockOf(vanilla.id), 5);
      assert.equal(await stockOf(chocolate.id), 1);
      assert.equal(await stockOf(flexible.id), 3);
      const ledger = await stockHistory(flexible.id);
      await assert.rejects(
        changeStock(flexible.id, {
          type: "exit",
          quantity: 2,
          selections: choices,
        }),
        /insuficiente/,
      );
      assert.equal(await stockOf(vanilla.id), 5);
      assert.equal((await stockHistory(flexible.id)).length, ledger.length);
      await assert.rejects(service.deleteProduct(chocolate.id), /kit/);
      await assert.rejects(
        service.editProduct(chocolate.id, {
          name: chocolate.name,
          selling_price: "1200",
          variant_group: "Otra bolsa",
        }),
        /presentación/,
      );
      await assert.rejects(
        service.createProduct({
          name: "Duplicado",
          kind: "kit",
          components: [
            { variant_group: "Proteína bolsa", quantity: 1 },
            { product_id: chocolate.id, quantity: 1 },
          ],
        }),
        /repitas/,
      );
      const extra = await service.createProduct({
        name: "Proteína bolsa · Frutilla",
        selling_price: "1000",
        variant_group: "Proteína bolsa",
      });
      assert.equal(await stockOf(flexible.id), null);
      await changeStock(flexible.id, {
        type: "exit",
        quantity: 1,
        selections: [
          {
            component_product_id: componentId,
            product_id: vanilla.id,
            quantity: 2,
          },
        ],
      });
      assert.equal(await stockOf(vanilla.id), 3);
      assert.equal(await stockOf(extra.id), null);
      await db.destroy();
      await connect();
      familyKit = (await service.products()).find(
        (x: any) => x.id === flexible.id,
      );
      assert.equal(familyKit.components[0].variants.length, 3);
      assert.equal((await stockHistory(flexible.id)).length, 3);

      const prior = (await service.products()).find(
        (x: any) => x.id === vanilla.id,
      );
      await service.editSellingPrice(vanilla.id, "1500.25");
      const repriced = (await service.products()).find(
        (x: any) => x.id === vanilla.id,
      );
      for (const key of [
        "name",
        "code",
        "barcode",
        "own_stock",
        "variant_group",
        "offers",
      ])
        assert.deepEqual(repriced[key], prior[key]);
      assert.equal(repriced.selling_price, "1500.25");
      familyKit = (await service.products()).find(
        (x: any) => x.id === flexible.id,
      );
      assert.equal(familyKit.selling_price_max, "2700");
      const kitBeforeDiscount = familyKit;
      await service.editKitDiscount(flexible.id, "20");
      familyKit = (await service.products()).find(
        (x: any) => x.id === flexible.id,
      );
      assert.equal(familyKit.kit_discount_percent, "20.00000000");
      assert.equal(familyKit.selling_price_max, "2400");
      for (const key of ["name", "components", "own_stock"])
        assert.deepEqual(familyKit[key], kitBeforeDiscount[key]);
      for (const value of ["", null, "NaN", "-1", "101", "1.123456789"])
        await assert.rejects(
          service.editKitDiscount(flexible.id, value),
          /descuento|Descuento/,
        );
      await assert.rejects(service.editKitDiscount(vanilla.id, "20"), /kit/);
      await assert.rejects(
        service.editSellingPrice(flexible.id, "5000"),
        /descuento/,
      );
      for (const value of ["", null, "NaN", "-1", "1000000000000001"])
        await assert.rejects(
          service.editSellingPrice(vanilla.id, value),
          /Importe/,
        );
      await service.editKitPricing(flexible.id, {
        kit_pricing_mode: "final",
        selling_price: "5050",
      });
      await service.editSellingPrice(vanilla.id, "9999");
      familyKit = (await service.products()).find(
        (x: any) => x.id === flexible.id,
      );
      assert.equal(familyKit.kit_pricing_mode, "final");
      assert.equal(familyKit.selling_price, "5100");
      assert.equal(familyKit.selling_price_max, "5100");
      assert.deepEqual(
        familyKit.components.map((c: any) => [
          c.product_id,
          c.quantity,
          c.variant_group,
        ]),
        kitBeforeDiscount.components.map((c: any) => [
          c.product_id,
          c.quantity,
          c.variant_group,
        ]),
      );
      for (const value of ["", null, "NaN", "-1", "1000000000000001"])
        await assert.rejects(
          service.editKitPricing(flexible.id, {
            kit_pricing_mode: "final",
            selling_price: value,
          }),
        );
      await assert.rejects(
        service.editKitPricing(flexible.id, {
          kit_pricing_mode: "other",
          selling_price: "1000",
        }),
      );
      await service.editKitPricing(flexible.id, {
        kit_pricing_mode: "discount",
        kit_discount_percent: "10",
      });
      familyKit = (await service.products()).find(
        (x: any) => x.id === flexible.id,
      );
      assert.equal(familyKit.kit_pricing_mode, "discount");
      assert.equal(familyKit.selling_price_max, "18000");
      await service.editKitPricing(flexible.id, {
        kit_pricing_mode: "final",
        selling_price: "5000",
      });
      await service.editSellingPrice(vanilla.id, "0");
      const movementsBeforeCorrection = await stockHistory(vanilla.id);
      await setRealStock(vanilla.id, "3");
      await setRealStock(vanilla.id, "3");
      assert.equal(await stockOf(vanilla.id), 3);
      assert.deepEqual(
        await stockHistory(vanilla.id),
        movementsBeforeCorrection,
      );
      for (const value of [-1, 1.5, null, "", "1000000001"])
        await assert.rejects(setRealStock(vanilla.id, value));
      await assert.rejects(setRealStock(flexible.id, 3), /componen/);

      await db.destroy();
      await connect();
      familyKit = (await service.products()).find(
        (x: any) => x.id === flexible.id,
      );
      assert.equal(familyKit.kit_pricing_mode, "final");
      assert.equal(familyKit.selling_price, "5000");
      assert.equal(await stockOf(vanilla.id), 3);
      assert.equal(
        (await service.products()).find((x: any) => x.id === vanilla.id)
          .selling_price,
        "0",
      );

      const { receivePurchase, purchases, purchaseSummary } =
        await import("./purchases");
      const { randomUUID } = await import("node:crypto");
      await setRealStock(p.id, 0);
      const received = {
        provider_id: 1,
        received_on: "2026-10-10",
        request_key: randomUUID(),
        items: [
          {
            product_id: p.id,
            quantity: 7,
            unit_price: "123.4567",
            currency: "USD",
          },
        ],
        note: "Factura 123",
      };
      const [firstPurchase, repeatedPurchase] = await Promise.all([
        receivePurchase(received),
        receivePurchase(received),
      ]);
      assert.equal(firstPurchase.id, repeatedPurchase.id);
      assert.equal(await stockOf(p.id), 7);
      const recorded = (await purchases()).find(
        (x: any) => x.id === firstPurchase.id,
      );
      assert.equal(recorded.items[0].total, "864.1969");
      assert.equal(recorded.items[0].previous_stock, 0);
      assert.equal(recorded.items[0].resulting_stock, 7);
      await assert.rejects(
        receivePurchase({
          ...received,
          items: [{ ...received.items[0], quantity: 8 }],
        }),
        /otros datos/,
      );
      await assert.rejects(
        receivePurchase({
          ...received,
          request_key: randomUUID(),
          items: [
            ...received.items,
            {
              product_id: vanilla.id,
              quantity: 1,
              unit_price: "1",
              currency: "ARS",
            },
          ],
        }),
        /vinculado/,
      );
      assert.equal(await stockOf(p.id), 7);
      assert.equal((await purchases()).length, 1);
      const purchaseStats = await purchaseSummary();
      assert.equal(purchaseStats.total, 1);
      assert.equal(purchaseStats.totals[0].total, "864.1969");

      for (const quantity of [0, -1, 1.5, "1000000001"])
        await assert.rejects(
          receivePurchase({
            ...received,
            request_key: randomUUID(),
            items: [{ ...received.items[0], quantity }],
          }),
        );
      await assert.rejects(
        receivePurchase({
          ...received,
          request_key: randomUUID(),
          received_on: "2026-02-31",
        }),
      );
      const unknownStock = await service.createProduct({
        name: individual.name,
        selling_price: "1000",
        source_item_id: individual.id,
      });
      await assert.rejects(
        receivePurchase({
          ...received,
          request_key: randomUUID(),
          items: [{ ...received.items[0], product_id: unknownStock.id }],
        }),
        /stock real/,
      );
      await service.deleteProduct(unknownStock.id);

      await db.destroy();
      await connect();
      assert.equal((await purchases())[0].id, firstPurchase.id);
      assert.equal(await stockOf(p.id), 7);
      const { processImage, imageKey } = await import("./images");
      const photoFolder = await mkdtemp(
        join(tmpdir(), "price-checker-image-test-"),
      );
      try {
        const imageUrl = "https://app.coverweb.com.ar/imagenes_url/shared.png";
        const imageSnapshot = structuredClone(snapshot);
        imageSnapshot.products[0].image_url = imageUrl;
        imageSnapshot.products[1].image_url = imageUrl;
        await importSnapshot(imageSnapshot, 1);
        const key = imageKey(imageUrl);
        await writeFile(
          join(photoFolder, key),
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
        // The nonexistent downloader proves cached files cause no process/network call.
        assert.equal(
          await processImage(process.cwd(), "/nonexistent-python", photoFolder),
          true,
        );
        const cached = await db.query(
          "SELECT image_path FROM supplier_items WHERE image_url=$1",
          [imageUrl],
        );
        assert.equal(cached.length, 2);
        assert(cached.every((x: any) => x.image_path === key));
        assert.equal(
          await processImage(process.cwd(), "/nonexistent-python", photoFolder),
          false,
        );
        imageSnapshot.products[0].image_url =
          "https://app.coverweb.com.ar/imagenes_url/replaced.jpg";
        await importSnapshot(imageSnapshot, 1);
        const [retained] = await db.query(
          "SELECT image_url,image_path FROM supplier_items WHERE external_id=$1",
          [imageSnapshot.products[0].id],
        );
        assert.equal(retained.image_url, imageUrl);
        assert.equal(retained.image_path, key);
        assert.equal(
          await processImage(process.cwd(), "/nonexistent-python", photoFolder),
          false,
        );
        await db.destroy();
        await connect();
        const [persisted] = await db.query(
          "SELECT image_path FROM supplier_items WHERE external_id=$1",
          [imageSnapshot.products[0].id],
        );
        assert.equal(persisted.image_path, key);
        imageSnapshot.products[2].image_url =
          "https://app.coverweb.com.ar/imagenes_url/missing.jpg";
        await importSnapshot(imageSnapshot, 1);
        assert.equal(
          await processImage(process.cwd(), "/nonexistent-python", photoFolder),
          true,
        );
        const [failed] = await db.query(
          "SELECT image_path,image_attempts,image_next_attempt>now() delayed FROM supplier_items WHERE external_id=$1",
          [imageSnapshot.products[2].id],
        );
        assert.equal(failed.image_path, null);
        assert.equal(failed.image_attempts, 1);
        assert.equal(failed.delayed, true);
        assert.equal(await stockOf(vanilla.id), 3);
      } finally {
        await rm(photoFolder, { recursive: true, force: true });
      }

      const { cashAccounts, createAccount, cashOperation, setOpeningBalance } =
        await import("./cash");
      const cashA = await createAccount({
        name: "Efectivo test",
        currency: "ARS",
        opening_balance: "1000",
      });
      const cashB = await createAccount({
        name: "Transferencia test",
        currency: "ARS",
        opening_balance: "500",
      });
      const cashUsd = await createAccount({
        name: "USD test",
        currency: "USD",
        opening_balance: "25",
      });
      const income = {
        kind: "income",
        account_id: cashA.id,
        amount: "10.25",
        note: "Ingreso test",
        occurred_on: "2026-10-10",
        request_key: randomUUID(),
      };
      const receipts = await Promise.all([
        cashOperation(income),
        cashOperation(income),
      ]);
      assert.equal(receipts[0].id, receipts[1].id);
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === cashA.id).balance,
        "1010.25",
      );
      await cashOperation({
        kind: "transfer",
        account_id: cashA.id,
        destination_id: cashB.id,
        amount: "100.10",
        note: "Transferencia test",
        occurred_on: "2026-10-10",
        request_key: randomUUID(),
      });
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === cashA.id).balance,
        "910.15",
      );
      assert.equal(
        Number(
          (await cashAccounts()).find((a: any) => a.id === cashB.id).balance,
        ),
        600.1,
      );
      await assert.rejects(() => setOpeningBalance(cashA.id, "0"));
      const debtAccount = await createAccount({
        name: "Deuda test",
        currency: "ARS",
        opening_balance: "-237600",
      });
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === debtAccount.id)
          .balance,
        "-237600",
      );
      await cashOperation({
        ...income,
        account_id: debtAccount.id,
        kind: "expense",
        amount: "10000",
        request_key: randomUUID(),
      });
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === debtAccount.id)
          .balance,
        "-247600",
      );
      await cashOperation({
        ...income,
        account_id: debtAccount.id,
        amount: "250000",
        request_key: randomUUID(),
      });
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === debtAccount.id)
          .balance,
        "2400",
      );
      await cashOperation({
        ...income,
        account_id: debtAccount.id,
        destination_id: cashUsd.id,
        kind: "transfer",
        amount: "1",
        request_key: randomUUID(),
      }).then(
        () => assert.fail("Currency mismatch must fail"),
        () => {},
      );
      await assert.rejects(() =>
        createAccount({
          name: "Invalid balance",
          currency: "ARS",
          opening_balance: "-1.001",
        }),
      );
      await assert.rejects(() =>
        cashOperation({ ...income, amount: "-10", request_key: randomUUID() }),
      );
      await assert.rejects(() =>
        cashOperation({
          ...income,
          kind: "transfer",
          destination_id: cashUsd.id,
          request_key: randomUUID(),
        }),
      );
      const [invoice] = await db.query(
        "SELECT purchase_id FROM purchase_items WHERE currency='USD' LIMIT 1",
      );
      assert(invoice);
      const payment = {
        ...income,
        kind: "expense",
        amount: "300",
        purchase_id: invoice.purchase_id,
        purchase_currency: "USD",
        purchase_amount: "100",
        request_key: randomUUID(),
      };
      await Promise.all([cashOperation(payment), cashOperation(payment)]);
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === cashA.id).balance,
        "610.15",
      );
      const [paymentCount] = await db.query(
        "SELECT count(*)::int n FROM purchase_payments WHERE purchase_id=$1",
        [invoice.purchase_id],
      );
      assert.equal(paymentCount.n, 1);
      await assert.rejects(() =>
        cashOperation({
          ...payment,
          purchase_amount: "1e15",
          amount: "1",
          request_key: randomUUID(),
        }),
      );
      await assert.rejects(() =>
        cashOperation({
          ...income,
          amount: "10.251",
          request_key: randomUUID(),
        }),
      );
      await assert.rejects(() =>
        cashOperation({
          ...income,
          occurred_on: "2026-02-31",
          request_key: randomUUID(),
        }),
      );
      const outgoing = {
        ...income,
        account_id: cashB.id,
        kind: "expense",
        amount: "500",
      };
      const cashCompeting = await Promise.allSettled([
        cashOperation({ ...outgoing, request_key: randomUUID() }),
        cashOperation({ ...outgoing, request_key: randomUUID() }),
      ]);
      assert.equal(
        cashCompeting.filter((r) => r.status === "fulfilled").length,
        2,
      );
      assert.equal(
        Number(
          (await cashAccounts()).find((a: any) => a.id === cashB.id).balance,
        ),
        -399.9,
      );
      const [uncounted] = await db.query(
        "INSERT INTO cash_accounts(name,currency) VALUES('Sin saldo test','ARS') RETURNING id",
      );
      await assert.rejects(() =>
        cashOperation({
          ...income,
          account_id: uncounted.id,
          request_key: randomUUID(),
        }),
      );
      await setOpeningBalance(uncounted.id, "-20");
      await cashOperation({
        ...income,
        account_id: uncounted.id,
        amount: "1",
        request_key: randomUUID(),
      });
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === uncounted.id).balance,
        "-19",
      );
      const {
        customers,
        saveCustomer,
        createSale,
        collectSale,
        sales,
        salesSummary,
      } = await import("./sales");
      const client = await saveCustomer({
        name: "Cliente test",
        phone: "123",
        instagram: "@cliente_test",
        note: "Solo prueba",
      });
      await saveCustomer(
        { name: "Cliente editado", phone: "456", note: "" },
        client.id,
      );
      assert.equal(
        (await customers()).find((c: any) => c.id === client.id).instagram,
        "@cliente_test",
      );
      await saveCustomer(
        {
          name: "Cliente editado",
          phone: "456",
          instagram: "@cliente_editado",
          note: "",
        },
        client.id,
      );
      await assert.rejects(() =>
        saveCustomer({ name: "Inválido", instagram: "x".repeat(101) }),
      );
      const saleA = await service.createProduct({
        name: "Sabor A ventas",
        selling_price: "1000",
        variant_group: "Sabores ventas",
      });
      const saleB = await service.createProduct({
        name: "Sabor B ventas",
        selling_price: "1200",
        variant_group: "Sabores ventas",
      });
      const saleVariants = (await service.products()).filter((product: any) =>
        [saleA.id, saleB.id].includes(product.id),
      );
      assert.equal(saleVariants.length, 2);
      for (const variant of saleVariants) {
        assert.equal(variant.selling_price, "1000");
        assert.equal(variant.catalog_price, "1000");
      }
      await db.query(
        "UPDATE products SET own_stock=10 WHERE id=ANY($1::int[])",
        [[saleA.id, saleB.id]],
      );
      const saleKit = await service.createProduct({
        name: "Promo ventas",
        kind: "kit",
        kit_discount_percent: "10",
        components: [{ variant_group: "Sabores ventas", quantity: 2 }],
      });
      const kitSelection = [
        { component_product_id: saleA.id, product_id: saleA.id, quantity: 1 },
        { component_product_id: saleA.id, product_id: saleB.id, quantity: 1 },
      ];
      const saleBody = {
        customer_id: client.id,
        sold_on: "2026-10-10",
        request_key: randomUUID(),
        items: [
          { product_id: saleKit.id, quantity: 2, selections: kitSelection },
        ],
        payment: { account_id: cashA.id, amount: "500" },
      };
      const sold = await Promise.all([
        createSale(saleBody),
        createSale(saleBody),
      ]);
      assert.equal(sold[0].id, sold[1].id);
      assert.equal(await stockOf(saleA.id), 8);
      assert.equal(await stockOf(saleB.id), 8);
      const [soldInvoice] = await sales({ customer_id: client.id });
      // Both flavors inherit 1000: each x2 promo is 1800 after its 10% discount.
      assert.equal(soldInvoice.items[0].unit_price, "1800");
      assert.equal(soldInvoice.items[0].total, "3600");
      assert.equal(soldInvoice.total, "3600");
      assert.equal(soldInvoice.pending, "3100");
      assert.equal(soldInvoice.cost_total, null);
      assert.equal(soldInvoice.items[0].components.length, 2);
      assert.equal(
        (await customers()).find((c: any) => c.id === client.id).balance,
        "3100",
      );
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === cashA.id).balance,
        "1110.15",
      );
      await assert.rejects(() =>
        createSale({
          ...saleBody,
          items: [{ product_id: saleKit.id, quantity: 2, selections: [] }],
          request_key: randomUUID(),
        }),
      );
      await assert.rejects(() =>
        createSale({
          ...saleBody,
          items: [
            {
              product_id: saleKit.id,
              quantity: 1,
              selections: [
                {
                  component_product_id: saleA.id,
                  product_id: p.id,
                  quantity: 2,
                },
              ],
            },
          ],
          request_key: randomUUID(),
        }),
      );
      await assert.rejects(() =>
        createSale({
          ...saleBody,
          payment: { account_id: cashUsd.id, amount: "1" },
          request_key: randomUUID(),
        }),
      );
      assert.equal(await stockOf(saleA.id), 8); // rejected cash account rolls stock back.
      const anonymous = {
        sold_on: "2026-10-10",
        request_key: randomUUID(),
        items: [{ product_id: saleA.id, quantity: 1, unit_price: "1000" }],
      };
      await assert.rejects(() => createSale(anonymous));
      await createSale({
        ...anonymous,
        payment: { account_id: cashA.id, amount: "1000" },
      });
      const collection = {
        amount: "1000",
        account_id: cashB.id,
        occurred_on: "2026-10-10",
        request_key: randomUUID(),
      };
      const collected = await Promise.all([
        collectSale(sold[0].id, collection),
        collectSale(sold[0].id, collection),
      ]);
      assert.equal(collected[0].id, collected[1].id);
      await assert.rejects(() =>
        collectSale(sold[0].id, {
          ...collection,
          amount: "2200", // Exceeds the exact 2100 remaining after collecting 1000.
          request_key: randomUUID(),
        }),
      );
      await assert.rejects(() =>
        collectSale(sold[0].id, {
          ...collection,
          amount: "1000.001",
          request_key: randomUUID(),
        }),
      );
      assert.equal(
        (await customers()).find((c: any) => c.id === client.id).balance,
        "2100",
      );
      const remaining = { ...collection, amount: "2100" };
      const competingCollections = await Promise.allSettled([
        collectSale(sold[0].id, { ...remaining, request_key: randomUUID() }),
        collectSale(sold[0].id, { ...remaining, request_key: randomUUID() }),
      ]);
      assert.equal(
        competingCollections.filter((r) => r.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (await customers()).find((c: any) => c.id === client.id).balance,
        "0",
      );
      const competingSale = {
        customer_id: client.id,
        sold_on: "2026-10-10",
        items: [{ product_id: saleB.id, quantity: 8 }],
      };
      const oversold = await Promise.allSettled([
        createSale({ ...competingSale, request_key: randomUUID() }),
        createSale({ ...competingSale, request_key: randomUUID() }),
      ]);
      assert.equal(oversold.filter((r) => r.status === "fulfilled").length, 2);
      assert.equal(await stockOf(saleB.id), -8);
      assert(
        oversold.some(
          (r) => r.status === "fulfilled" && r.value.warnings.length > 0,
        ),
      );
      // Snapshot prices/costs remain historical when the supplier and selling prices change.
      const known = await service.createProduct({
        name: individual.name,
        selling_price: "25000",
        source_item_id: individual.id,
      });
      await db.query("UPDATE products SET own_stock=2 WHERE id=$1", [known.id]);
      const costBefore = (await service.products()).find(
        (p: any) => p.id === known.id,
      ).selected.costArs;
      const knownSale = await createSale({
        customer_id: client.id,
        sold_on: "2026-10-10",
        request_key: randomUUID(),
        items: [{ product_id: known.id, quantity: 1 }],
      });
      const original = (await sales()).find((s: any) => s.id === knownSale.id);
      assert(new Decimal(original.cost_total).eq(costBefore));
      await service.editSellingPrice(known.id, "30000");
      await db.query("UPDATE supplier_items SET price=price+1 WHERE id=$1", [
        individual.id,
      ]);
      assert.equal(
        (await sales()).find((s: any) => s.id === knownSale.id).total,
        "25000",
      );
      assert.equal(
        (await sales()).find((s: any) => s.id === knownSale.id).cost_total,
        original.cost_total,
      );
      assert.equal((await salesSummary()).count, 5);
      await db.destroy();
      await connect();
      assert.equal(
        (await cashAccounts()).find((a: any) => a.id === cashA.id).balance,
        "2110.15",
      );
      assert.equal((await salesSummary()).count, 5);
      assert.equal(
        (await customers()).find((c: any) => c.id === client.id).name,
        "Cliente editado",
      );
      assert.equal(
        (await customers()).find((c: any) => c.id === client.id).instagram,
        "@cliente_editado",
      );
      // Each promo is submitted independently: three x2 promos, six flavor units.
      // Explicit negotiated unit prices may differ from the common catalog price.
      const stockABefore = await stockOf(saleA.id);
      const stockBBefore = await stockOf(saleB.id);
      const variedPromos = await createSale({
        customer_id: client.id,
        sold_on: "2026-10-10",
        request_key: randomUUID(),
        items: [
          {
            product_id: saleKit.id,
            quantity: 1,
            unit_price: "1620",
            selections: [
              {
                component_product_id: saleA.id,
                product_id: saleA.id,
                quantity: 2,
              },
            ],
          },
          {
            product_id: saleKit.id,
            quantity: 1,
            unit_price: "1980",
            selections: [
              {
                component_product_id: saleA.id,
                product_id: saleB.id,
                quantity: 2,
              },
            ],
          },
          {
            product_id: saleKit.id,
            quantity: 1,
            unit_price: "1800",
            selections: kitSelection,
          },
        ],
      });
      assert.equal(await stockOf(saleA.id), stockABefore - 3);
      assert.equal(await stockOf(saleB.id), stockBBefore - 3);
      const variedInvoice = (await sales()).find(
        (s: any) => s.id === variedPromos.id,
      );
      assert.equal(variedInvoice.total, "5400");
      assert.equal(variedInvoice.pending, "5400");
      assert.equal(variedInvoice.items.length, 3);
      assert.deepEqual(
        variedInvoice.items.map((i: any) => i.components.length).sort(),
        [1, 1, 2],
      );
      // Generic supplier pack quantities are explicit and survive a catalog refresh.
      const generic = await service.createProduct({
        name: "Pack configurable",
        selling_price: "10000",
        source_item_id: boxOffer.id,
        source_units: 12,
      });
      let genericView = (await service.products()).find(
        (x: any) => x.id === generic.id,
      );
      assert.equal(genericView.selected.cost.units, 12);
      await service.saveLink(generic.id, {
        provider_id: 1,
        kit_item_id: boxOffer.id,
        kit_units: 6,
        matches_confirmed: true,
      });
      genericView = (await service.products()).find(
        (x: any) => x.id === generic.id,
      );
      assert.equal(genericView.selected.cost.units, 6);
      await assert.rejects(
        service.saveLink(generic.id, {
          provider_id: 1,
          kit_item_id: boxOffer.id,
          kit_units: 0,
        }),
      );
      // A custom photo takes precedence and survives provider imports; null restores the provider photo.
      const upload =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=";
      const photo = await service.createProduct({
        name: "Producto con imagen",
        minimum_stock:3,
        selling_price: "100",
        image_data: upload,
      });
      const photoView = () =>
        service
          .products()
          .then((rows: any[]) => rows.find((x) => x.id === photo.id));
      assert.equal((await photoView()).minimum_stock,3);
      await assert.rejects(service.editProduct(photo.id,{name:photo.name,selling_price:"100",minimum_stock:-1}));
      assert.match((await photoView()).custom_image_path, /^[a-f0-9]{64}$/);
      assert.equal(
        (await photoView()).image_path,
        (await photoView()).custom_image_path,
      );
      await importSnapshot(snapshot, 1);
      assert.equal(
        (await service.products()).find((x: any) => x.id === generic.id)
          .selected.cost.units,
        6,
      );
      assert((await photoView()).custom_image_path);
      await service.editProduct(photo.id, {
        name: photo.name,
        selling_price: "100",
        image_data: null,
      });
      assert.equal((await photoView()).custom_image_path, null);
      await assert.rejects(
        service.editProduct(photo.id, {
          name: photo.name,
          selling_price: "100",
          image_data: "data:image/svg+xml;base64,PHN2Zz4=",
        }),
      );
      // Price comparisons are committed with the catalog, immutable afterwards,
      // and excluded from the frequently polled run list.
      const [comparisonProvider] = await db.query(
        "INSERT INTO providers(name,adapter) VALUES ('Price comparison tests','coverweb') RETURNING id",
      );
      const comparisonSnapshot = (amount: string) => ({
        ...snapshot,
        products: snapshot.products.slice(0, 35).map((p: any, i: number) => ({
          ...p,
          id: `comparison-${i}`,
          price: {
            ...p.price,
            currency: "ARS",
            amount,
            source_amount: amount,
          },
        })),
        product_count: 35,
        catalog_reported_total: 35,
        currencies: { ARS: 35 },
        pages_scraped: 1,
      });
      await importSnapshot(comparisonSnapshot("100"), comparisonProvider.id);
      const [comparisonRun] = await db.query(
        "INSERT INTO refresh_runs(provider_id,status,trigger) VALUES ($1,'running','manual') RETURNING id",
        [comparisonProvider.id],
      );
      await importSnapshot(
        comparisonSnapshot("110"),
        comparisonProvider.id,
        comparisonRun.id,
      );
      const changes = await service.priceChanges(comparisonRun.id, {});
      assert.equal(changes.total, 35);
      assert.equal(changes.items.length, 30);
      assert.equal(changes.summary.increased, 35);
      assert.equal(changes.items[0].delta, "10");
      assert.equal(changes.items[0].percent, "10");
      assert.equal(
        (await service.priceChanges(comparisonRun.id, { page: 2 })).items
          .length,
        5,
      );
      assert.equal(
        (await service.priceChanges(comparisonRun.id, { direction: "down" }))
          .total,
        0,
      );
      assert.equal(
        (
          await service.priceChanges(comparisonRun.id, {
            search: "comparison-34",
          })
        ).total,
        1,
      );
      assert(
        !Object.hasOwn(
          (await service.runs()).find((r: any) => r.id === comparisonRun.id),
          "price_changes",
        ),
      );
      await importSnapshot(comparisonSnapshot("120"), comparisonProvider.id);
      assert.equal(
        (await service.priceChanges(comparisonRun.id, {})).items[0].new_price,
        "110",
      );
      const [badComparisonRun] = await db.query(
        "INSERT INTO refresh_runs(provider_id,status,trigger) VALUES ($1,'running','manual') RETURNING id",
        [comparisonProvider.id],
      );
      await assert.rejects(
        importSnapshot(
          { ...comparisonSnapshot("999"), product_count: 36 },
          comparisonProvider.id,
          badComparisonRun.id,
        ),
      );
      assert.equal(
        (await service.priceChanges(badComparisonRun.id, {})).summary,
        null,
      );
      const [stillCurrent] = await db.query(
        "SELECT price::text FROM supplier_items WHERE provider_id=$1 LIMIT 1",
        [comparisonProvider.id],
      );
      assert.equal(stillCurrent.price, "120");
    } finally {
      await db.destroy();
    }
  },
);
