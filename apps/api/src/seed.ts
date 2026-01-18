import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connect, db } from "./db";
import { importSnapshot } from "./catalog";
async function main() {
  await connect();
  const snapshot = JSON.parse(
    await readFile(
      process.env.SEED_FILE ||
        resolve(process.cwd(), "../../data/disfit-prices.json"),
      "utf8",
    ),
  );
  const [p] = await db.query("SELECT id FROM providers WHERE name='Disfit'");
  await importSnapshot(snapshot, p.id);
  console.log(`Importados ${snapshot.product_count} productos de Disfit`);
  await db.destroy();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
