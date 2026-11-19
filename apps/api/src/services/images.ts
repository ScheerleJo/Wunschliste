import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { asc, inArray } from "drizzle-orm";
import sharp from "sharp";
import type { WishImageDto } from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { wishImage } from "../db/schema.ts";
import { env } from "../env.ts";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "heif", "avif"]);
const FULL_SIZE = 1600;
const THUMB_SIZE = 480;

export const uploadRoot = path.resolve(env.uploadDir);

/** Absoluter Pfad zu einer gespeicherten Datei; verhindert Pfade außerhalb des Upload-Ordners. */
export function resolveUpload(relative: string) {
  const abs = path.resolve(uploadRoot, relative);
  if (!abs.startsWith(uploadRoot + path.sep)) throw new Error("Ungültiger Pfad");
  return abs;
}

export class InvalidImageError extends Error {}

/**
 * Bild verarbeiten und speichern:
 * - nur echte Bilder (Format wird am Inhalt erkannt, nicht an der Endung)
 * - nach EXIF ausrichten, auf max. 1600 px verkleinern, als WebP speichern
 * - Metadaten (GPS-Position, Kamera, …) werden dabei entfernt
 */
export async function processAndStore(wishId: string, imageId: string, input: Buffer) {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new InvalidImageError("Die Datei ist kein unterstütztes Bild");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new InvalidImageError("Bitte lade ein Foto oder einen Screenshot hoch (JPG, PNG, WebP, GIF)");
  }

  const base = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  let full: { data: Buffer; info: sharp.OutputInfo };
  let thumb: Buffer;
  try {
    full = await base
      .clone()
      .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    thumb = await base
      .clone()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
  } catch {
    throw new InvalidImageError("Das Bild konnte nicht gelesen werden (z. B. HEIC wird nicht unterstützt)");
  }

  const dir = wishId;
  const filePath = path.join(dir, `${imageId}.webp`);
  const thumbPath = path.join(dir, `${imageId}_thumb.webp`);
  await mkdir(resolveUpload(dir), { recursive: true });
  await writeFile(resolveUpload(filePath), full.data);
  await writeFile(resolveUpload(thumbPath), thumb);
  return { filePath, thumbPath, width: full.info.width, height: full.info.height };
}

export async function removeFiles(...relative: string[]) {
  await Promise.all(relative.map((r) => rm(resolveUpload(r), { force: true }).catch(() => {})));
}

/** Löscht alle Bilddateien eines Wunsches (vor bzw. nach dem endgültigen Löschen). */
export async function removeWishFiles(wishId: string) {
  await rm(resolveUpload(wishId), { recursive: true, force: true }).catch(() => {});
}

export async function imagesFor(wishIds: string[]): Promise<Map<string, WishImageDto[]>> {
  const map = new Map<string, WishImageDto[]>();
  if (wishIds.length === 0) return map;
  const rows = await db
    .select()
    .from(wishImage)
    .where(inArray(wishImage.wishId, wishIds))
    .orderBy(asc(wishImage.sortOrder), asc(wishImage.createdAt));
  for (const r of rows) {
    const list = map.get(r.wishId) ?? [];
    list.push({ id: r.id, width: r.width, height: r.height });
    map.set(r.wishId, list);
  }
  return map;
}
