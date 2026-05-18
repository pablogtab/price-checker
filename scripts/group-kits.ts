import { connect, db } from "../apps/api/src/db";
import { saveComponents, saveKitPricing } from "../apps/api/src/bundles";

// Explicitly reviewed presentation families: packaging and size stay separate.
const families = [
  {
    name: "STAR Platinum Whey Protein DOYPACK 3 KG",
    ids: [37, 48, 49, 50, 51],
  },
  {
    name: "STAR Premium Whey Protein DOYPACK 2 LB",
    ids: [38, 52, 53, 54, 55, 99, 100],
  },
  { name: "STAR Creatina Monohidrato Doypack 300 GR", ids: [39, 56, 57, 58] },
  { name: "STAR Citrato De Magnesio 500mg X 60 Capsulas", ids: [43] },
  { name: "ENA Barra De Proteína Ena Caja X 16 Un", ids: [44, 59, 60, 61] },
  { name: "ENA Barra De Proteína Ena Caja X Un", ids: [45, 62, 63, 64] },
  { name: "ENA Whey Protein True Made 1 KG", ids: [46, 65, 66, 67, 68] },
  { name: "Mutant Mass X 5KG", ids: [47, 69, 70, 71, 72] },
];
async function main() {
  await connect();
  try {
    await db.transaction(async (em) => {
      await em.query("SELECT pg_advisory_xact_lock(713450)");
      const units = await em.query(
        "SELECT * FROM products WHERE kind='product' AND NOT archived ORDER BY id FOR UPDATE",
      );
      for (const f of families)
        for (const id of f.ids) {
          const p = units.find((p: any) => p.id === id);
          if (!p || p.name.split(" · ")[0] !== f.name)
            throw new Error(
              "La presentación cambió; revisar antes de convertir: " + id,
            );
        }
      const kits = await em.query(
        "SELECT * FROM products WHERE kind='kit' AND NOT archived ORDER BY id FOR UPDATE",
      );
      if (
        kits.length === 3 &&
        kits.every((k: any) => [40, 41, 42].includes(k.id))
      ) {
        const [count] = await em.query(
          "SELECT count(*)::int n FROM product_components WHERE kit_id=ANY($1::int[]) AND variant_group IS NOT NULL",
          [[40, 41, 42]],
        );
        if (count.n === 4) {
          console.log("Los tres kits ya están agrupados");
          return;
        }
      }
      if (kits.length !== 39)
        throw new Error(
          "Se esperaban los 39 kits revisados; no se modificó nada",
        );
      const components = await em.query("SELECT * FROM product_components");
      const groups = new Map<string, any[]>();
      for (const k of kits) {
        const parts = components
          .filter((c: any) => c.kit_id === k.id)
          .map((c: any) => {
            const family = families.find((f) => f.ids.includes(c.product_id));
            if (!family)
              throw new Error("Componente sin presentación revisada");
            return { variant_group: family.name, quantity: c.quantity };
          })
          .sort((a: any, b: any) =>
            a.variant_group.localeCompare(b.variant_group),
          );
        const key = JSON.stringify(parts);
        groups.set(key, [...(groups.get(key) || []), { ...k, parts }]);
      }
      if (groups.size !== 3)
        throw new Error("Las composiciones cambiaron; revisar agrupación");
      for (const group of groups.values()) {
        if (new Set(group.map((k) => k.kit_discount_percent)).size !== 1)
          throw new Error(
            "Hay descuentos diferentes entre sabores; no se modificó nada",
          );
        if (![40, 41, 42].includes(group[0].id))
          throw new Error("Identidad del kit inesperada");
      }
      for (const f of families)
        await em.query(
          "UPDATE products SET variant_group=$1 WHERE id=ANY($2::int[])",
          [f.name, f.ids],
        );
      for (const group of groups.values()) {
        const main = group[0];
        await saveComponents(em, main.id, main.parts);
        await saveKitPricing(em, main.id, main.kit_discount_percent);
        await em.query("UPDATE products SET name=$1 WHERE id=$2", [
          main.name.split(" · ")[0],
          main.id,
        ]);
        await em.query(
          "UPDATE products SET archived=true WHERE id=ANY($1::int[])",
          [group.slice(1).map((k) => k.id)],
        );
      }
      console.log(
        "35 productos por sabor conservados; 3 kits por presentación; 36 combinaciones archivadas con su historial",
      );
    });
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
