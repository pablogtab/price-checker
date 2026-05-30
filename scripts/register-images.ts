import { readFile } from "node:fs/promises";
import { connect, db } from "../apps/api/src/db";
import { imageKey } from "../apps/api/src/images";
async function main() {
  const rows = JSON.parse(
    await readFile(process.argv[2] || "data/image-discovery.json", "utf8"),
  );
  if (!Array.isArray(rows)) throw new Error("Listado de fotos inválido");
  for (const row of rows) {
    if (!/^\d{1,50}$/.test(row.id)) throw new Error("Identificador inválido");
    imageKey(row.image_url);
  }
  await connect();
  try {
    await db.transaction(async (em) => {
      for (const row of rows)
        await em.query(
          "UPDATE supplier_items SET image_url=$1 WHERE provider_id=1 AND external_id=$2 AND image_path IS NULL",
          [row.image_url, row.id],
        );
    });
    console.log(
      "Fotos registradas sin modificar precios ni stock:",
      rows.length,
    );
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
