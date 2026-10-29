import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { EntityManager } from "typeorm";
import { db } from "./db";
import { imageRoot, imageMime, cachedImage, saveProductImage } from "./images";
const derivativeRoot = join(imageRoot, "media");
export async function getMediaAsset(
  id: number,
  manager: Pick<EntityManager, "query"> = db,
) {
  const [asset] = await manager.query(
    "SELECT * FROM media_assets WHERE id=$1",
    [id],
  );
  if (!asset) throw new NotFoundException("Imagen inexistente");
  const usages = await manager.query(
    "SELECT owner_type,owner_id,slot,label FROM media_asset_usages WHERE asset_id=$1 ORDER BY owner_type,owner_id,slot",
    [id],
  );
  return {
    ...asset,
    usages,
    url: `/api/media/${id}/file/desktop`,
    thumbnail_url: `/api/media/${id}/file/mobile`,
  };
}
export async function listMedia(q: any) {
  const page = Math.max(1, Number(q.page) || 1),
    limit = Math.max(1, Math.min(60, Number(q.limit) || 24));
  if (!Number.isInteger(page) || !Number.isInteger(limit))
    throw new BadRequestException("Página inválida");
  const search = typeof q.search === "string" ? q.search.slice(0, 200) : "";
  const [{ total }] = await db.query(
    "SELECT count(*)::int total FROM media_assets WHERE name ILIKE $1",
    ["%" + search + "%"],
  );
  const rows = await db.query(
    "SELECT id FROM media_assets WHERE name ILIKE $1 ORDER BY id DESC LIMIT $2 OFFSET $3",
    ["%" + search + "%", limit, (page - 1) * limit],
  );
  return {
    items: await Promise.all(rows.map((r: any) => getMediaAsset(r.id))),
    total,
    page,
    limit,
  };
}
export async function uploadMedia(body: any) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 200
  )
    throw new BadRequestException("Indicá un nombre de hasta 200 caracteres");
  if (
    typeof body.data !== "string" ||
    body.data.length > 7 * 1024 * 1024 ||
    !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      body.data,
    )
  )
    throw new BadRequestException(
      "Elegí una imagen JPG, PNG, GIF o WebP de hasta 5 MB",
    );
  const data = Buffer.from(body.data.split(",")[1], "base64");
  if (!data.length || data.length > 5 * 1024 * 1024)
    throw new BadRequestException("La imagen debe pesar hasta 5 MB");
  const mime = imageMime(data),
    hash = createHash("sha256").update(data).digest("hex");
  let width: number, height: number, mobile: Buffer, desktop: Buffer;
  try {
    const source = sharp(data, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
    });
    const metadata = await source.metadata();
    width = metadata.width!;
    height = metadata.height!;
    mobile = await source
      .clone()
      .rotate()
      .resize({
        width: 640,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    desktop = await source
      .clone()
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new BadRequestException(
      "No se pudo leer la imagen. Elegí un archivo válido de hasta 40 megapíxeles",
    );
  }
  await saveProductImage(body.data);
  await mkdir(derivativeRoot, { recursive: true });
  for (const [size, bytes] of [
    ["mobile", mobile],
    ["desktop", desktop],
  ] as const) {
    try {
      await writeFile(join(derivativeRoot, `${hash}-${size}.webp`), bytes, {
        flag: "wx",
      });
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  const [row] = await db.query(
    "INSERT INTO media_assets(content_hash,name,mime,bytes,width,height) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id",
    [hash, body.name.trim(), mime, data.length, width, height],
  );
  return getMediaAsset(row.id);
}
export async function mediaFile(id: number, size: string) {
  const asset = await getMediaAsset(id);
  if (size === "original") return cachedImage(asset.content_hash);
  if (!["mobile", "desktop"].includes(size))
    throw new NotFoundException("Versión inexistente");
  try {
    return {
      data: await readFile(
        join(derivativeRoot, `${asset.content_hash}-${size}.webp`),
      ),
      type: "image/webp",
    };
  } catch {
    throw new NotFoundException("Versión inexistente");
  }
}
/** Private existing sources, never downloads remote images or changes source assignments. */
export async function existingMedia(q: any) {
  const page = Math.max(1, Number(q.page) || 1);
  if (!Number.isInteger(page)) throw new BadRequestException("Página inválida");
  return db.query(
    `SELECT * FROM (SELECT 'product' source,id,name,custom_image_path image_key FROM products WHERE custom_image_path IS NOT NULL UNION ALL SELECT 'supplier',id,name,image_path FROM supplier_items WHERE image_path IS NOT NULL) sources ORDER BY source,id LIMIT 24 OFFSET $1`,
    [(page - 1) * 24],
  );
}
export async function importMedia(body: any) {
  if (
    !["product", "supplier"].includes(body.source) ||
    !Number.isInteger(body.id) ||
    body.id < 1
  )
    throw new BadRequestException("Origen inválido");
  const table = body.source === "product" ? "products" : "supplier_items",
    column = body.source === "product" ? "custom_image_path" : "image_path";
  const [row] = await db.query(
    `SELECT name,${column} image_key FROM ${table} WHERE id=$1`,
    [body.id],
  );
  if (!row?.image_key) throw new NotFoundException("Imagen inexistente");
  const { data, type } = await cachedImage(row.image_key);
  return uploadMedia({
    name: row.name.slice(0, 200),
    data: `data:${type};base64,${data.toString("base64")}`,
  });
}
/** Call inside the caller's transaction. Removing usage never removes the asset/file. */
export async function replaceMediaUsages(
  manager: Pick<EntityManager, "query">,
  ownerType: string,
  ownerId: string,
  slot: string,
  assetIds: number[],
  label: string,
) {
  if (
    !ownerType ||
    !ownerId ||
    !slot ||
    assetIds.some((id) => !Number.isInteger(id) || id < 1)
  )
    throw new BadRequestException("Uso de imagen inválido");
  for (const id of assetIds) await getMediaAsset(id, manager);
  await manager.query(
    "DELETE FROM media_asset_usages WHERE owner_type=$1 AND owner_id=$2 AND slot=$3",
    [ownerType, ownerId, slot],
  );
  for (const id of new Set(assetIds))
    await manager.query(
      "INSERT INTO media_asset_usages(asset_id,owner_type,owner_id,slot,label) VALUES($1,$2,$3,$4,$5)",
      [id, ownerType, ownerId, slot, label],
    );
}
