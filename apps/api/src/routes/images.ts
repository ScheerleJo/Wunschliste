import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, count, eq, sql } from "drizzle-orm";
import { MAX_IMAGE_UPLOAD_BYTES, MAX_IMAGES_PER_WISH, type WishImageDto } from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { reservation, wish, wishImage } from "../db/schema.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { badRequest, notFound } from "../lib/http.ts";
import { canManageProfile } from "../services/access.ts";
import { InvalidImageError, processAndStore, removeFiles, resolveUpload } from "../services/images.ts";
import { getOwnProfile } from "../services/profiles.ts";
import { canViewWish } from "../services/visibility.ts";
import { loadManagedWish } from "./wishes.ts";

export const imageRoutes = new Hono<AppEnv>();

/** Ein Bild hinzufügen zählt als inhaltliche Änderung (Hinweis für Reservierende). */
const touchWish = (wishId: string) => db.update(wish).set({ updatedAt: new Date() }).where(eq(wish.id, wishId));

imageRoutes.post(
  "/wishes/:wishId/images",
  bodyLimit({
    maxSize: MAX_IMAGE_UPLOAD_BYTES + 64 * 1024,
    onError: (c) => c.json({ error: "Das Bild ist zu groß (max. 15 MB)" }, 413),
  }),
  async (c) => {
    const u = requireUser(c);
    const w = await loadManagedWish(u.id, c.req.param("wishId"));

    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(wishImage).where(eq(wishImage.wishId, w.id));
    if (n >= MAX_IMAGES_PER_WISH) throw badRequest(`Maximal ${MAX_IMAGES_PER_WISH} Bilder pro Wunsch`);

    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) throw badRequest("Keine Datei erhalten");

    const id = randomUUID();
    let stored;
    try {
      stored = await processAndStore(w.id, id, Buffer.from(await file.arrayBuffer()));
    } catch (e) {
      if (e instanceof InvalidImageError) throw badRequest(e.message);
      throw e;
    }
    await db.insert(wishImage).values({ id, wishId: w.id, ...stored, sortOrder: n });
    await touchWish(w.id);
    return c.json({ id, width: stored.width, height: stored.height } satisfies WishImageDto, 201);
  },
);

imageRoutes.delete("/wishes/:wishId/images/:imageId", async (c) => {
  const u = requireUser(c);
  const w = await loadManagedWish(u.id, c.req.param("wishId"));
  const [img] = await db
    .delete(wishImage)
    .where(and(eq(wishImage.id, c.req.param("imageId")), eq(wishImage.wishId, w.id)))
    .returning();
  if (!img) throw notFound("Bild nicht gefunden");
  await removeFiles(img.filePath, img.thumbPath);
  await touchWish(w.id);
  return c.json({ ok: true });
});

/**
 * Bild ausliefern. Zugriff hat, wer die Liste verwaltet, den Wunsch sehen darf
 * oder ihn reserviert hat (auch wenn er inzwischen archiviert/gelöscht ist).
 */
async function serveImage(c: Context<AppEnv>, imageId: string, size: "full" | "thumb") {
  const u = requireUser(c);
  const [row] = await db
    .select({ img: wishImage, w: wish })
    .from(wishImage)
    .innerJoin(wish, eq(wish.id, wishImage.wishId))
    .where(eq(wishImage.id, imageId));
  if (!row) throw notFound("Bild nicht gefunden");

  const allowed =
    (row.w.status !== "deleted" && (await canManageProfile(u.id, row.w.profileId))) ||
    (await canViewWish((await getOwnProfile(u)).id, row.w)) ||
    (
      await db
        .select({ id: reservation.wishId })
        .from(reservation)
        .where(and(eq(reservation.wishId, row.w.id), eq(reservation.reservedByUserId, u.id)))
    ).length > 0;
  if (!allowed) throw notFound("Bild nicht gefunden");

  const data = await readFile(resolveUpload(size === "thumb" ? row.img.thumbPath : row.img.filePath)).catch(() => null);
  if (!data) throw notFound("Bild nicht gefunden");
  return c.body(data, 200, {
    "Content-Type": "image/webp",
    // privat: nur im Browser des Benutzers zwischenspeichern, Bilder ändern sich nie (neue ID bei neuem Bild)
    "Cache-Control": "private, max-age=604800, immutable",
    "X-Content-Type-Options": "nosniff",
  });
}

imageRoutes.get("/images/:imageId", (c) => serveImage(c, c.req.param("imageId"), "full"));
imageRoutes.get("/images/:imageId/thumb", (c) => serveImage(c, c.req.param("imageId"), "thumb"));
