import { createHash } from "node:crypto";
import { readFile, access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { db } from "./db";
export const imageRoot =
  process.env.IMAGE_ROOT ||
  resolve(
    process.env.SCRAPER_ROOT || resolve(__dirname, "../../.."),
    "data/images",
  );
export function imageKey(url: string) {
  if (
    !/^https:\/\/app\.coverweb\.com\.ar\/imagenes_url\/[A-Za-z0-9_./-]+$/.test(
      url,
    ) ||
    url.split("/").includes("..")
  )
    throw new BadRequestException("Imagen inválida");
  return createHash("sha256").update(url).digest("hex");
}
export function imageMime(data: Buffer) {
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg";
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString()))
    return "image/gif";
  if (
    data.subarray(0, 4).toString() === "RIFF" &&
    data.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  throw new BadRequestException("Formato de imagen inválido");
}
export async function cachedImage(key: string, cacheRoot = imageRoot) {
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new NotFoundException("Imagen inexistente");
  let data: Buffer;
  try {
    data = await readFile(join(cacheRoot, key));
  } catch {
    throw new NotFoundException("Imagen inexistente");
  }
  return { data, type: imageMime(data) };
}
export async function processImage(
  scraperRoot = process.env.SCRAPER_ROOT || resolve(__dirname, "../../.."),
  python = process.env.PYTHON || join(scraperRoot, ".venv/bin/python"),
  cacheRoot = imageRoot,
) {
  const [item] =
    await db.query(`SELECT s.id,s.image_url FROM supplier_items s WHERE s.image_url IS NOT NULL AND s.image_path IS NULL AND s.image_attempts<5 AND (s.image_next_attempt IS NULL OR s.image_next_attempt<=now())
    ORDER BY EXISTS(SELECT 1 FROM product_links l WHERE l.individual_item_id=s.id OR l.kit_item_id=s.id) DESC,s.id LIMIT 1`);
  if (!item) return false;
  try {
    const key = imageKey(item.image_url),
      output = join(cacheRoot, key);
    await mkdir(cacheRoot, { recursive: true });
    let exists = false;
    try {
      await access(output);
      exists = true;
    } catch {}
    if (!exists)
      await new Promise<void>((done, fail) => {
        const child = spawn(
          python,
          [
            join(scraperRoot, "scraper.py"),
            "image",
            "--url",
            item.image_url,
            "--output",
            output,
          ],
          { cwd: scraperRoot, stdio: "ignore" },
        );
        const timer = setTimeout(
          () => {
            child.kill("SIGTERM");
          },
          6 * 60 * 1000,
        );
        child.once("error", () => {
          clearTimeout(timer);
          fail(new Error("No se pudo descargar la imagen"));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          code === 0
            ? done()
            : fail(new Error("No se pudo descargar la imagen"));
        });
      });
    await cachedImage(key, cacheRoot);
    // Shared URLs use the same cached file; completed photos never get reset by imports.
    await db.query(
      "UPDATE supplier_items SET image_path=$1,image_next_attempt=NULL WHERE image_url=$2 AND image_path IS NULL",
      [key, item.image_url],
    );
  } catch {
    await db.query(
      "UPDATE supplier_items SET image_attempts=image_attempts+1,image_next_attempt=now()+interval '30 minutes' WHERE image_url=$1 AND image_path IS NULL",
      [item.image_url],
    );
  }
  return true;
}
