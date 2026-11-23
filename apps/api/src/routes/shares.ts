/**
 * Wunschliste per Link teilen – für Gäste ohne Konto (z. B. Patenonkel).
 *
 * - Der Besitzer (bzw. die Eltern bei Kinderlisten) erstellt Links und kann sie zurückziehen.
 * - Gäste sehen nur aktive Wünsche, die für alle Gruppen sichtbar sind.
 * - Der Link selbst ist die Identität des Gastes: Reservierungen hängen am Link. Jeder, der den Link öffnet,
 *   sieht sie als "von dir reserviert" (in jedem Browser, auf jedem Gerät). Daher: ein Link pro Person/Haushalt.
 * - Wie in der App: Wer reserviert hat, wird niemandem verraten. Der Besitzer bekommt nie Reservierungsdaten.
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import {
  shareLinkInputSchema,
  type GuestReservationDto,
  type ShareLinkDto,
  type ShareViewDto,
  type ViewWishDto,
} from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { profile, reservation, shareLink, wish, wishImage, wishLink } from "../db/schema.ts";
import { env } from "../env.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { notFound, parseJson } from "../lib/http.ts";
import { requireManageProfile } from "../services/access.ts";
import { imagesFor, removeWishFiles, resolveUpload } from "../services/images.ts";
import { isChanged } from "./reservations.ts";

export const shareRoutes = new Hono<AppEnv>();

const shareUrl = (token: string) => `${env.appUrl}/teilen/${token}`;

// ---------------------------------------------------------------------------
// Verwaltung durch den Besitzer
// ---------------------------------------------------------------------------

const activeCondition = () => and(isNull(shareLink.revokedAt), or(isNull(shareLink.expiresAt), gt(shareLink.expiresAt, new Date())));

shareRoutes.get("/profiles/:profileId/shares", async (c) => {
  const u = requireUser(c);
  const profileId = c.req.param("profileId");
  await requireManageProfile(u.id, profileId);
  const rows = await db
    .select()
    .from(shareLink)
    .where(and(eq(shareLink.profileId, profileId), activeCondition()))
    .orderBy(desc(shareLink.createdAt));
  const body: ShareLinkDto[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    url: shareUrl(r.token),
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
  }));
  return c.json(body);
});

shareRoutes.post("/profiles/:profileId/shares", async (c) => {
  const u = requireUser(c);
  const profileId = c.req.param("profileId");
  await requireManageProfile(u.id, profileId);
  const input = await parseJson(c, shareLinkInputSchema);
  const [row] = await db
    .insert(shareLink)
    .values({
      profileId,
      label: input.label,
      token: randomBytes(24).toString("base64url"),
      createdByUserId: u.id,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null,
    })
    .returning();
  const body: ShareLinkDto = {
    id: row!.id,
    label: row!.label,
    url: shareUrl(row!.token),
    createdAt: row!.createdAt.toISOString(),
    expiresAt: row!.expiresAt?.toISOString() ?? null,
  };
  return c.json(body, 201);
});

/** Link zurückziehen. Reservierungen der Gäste bleiben bestehen (damit nichts doppelt gekauft wird). */
shareRoutes.delete("/shares/:shareId", async (c) => {
  const u = requireUser(c);
  const [row] = await db.select().from(shareLink).where(eq(shareLink.id, c.req.param("shareId")));
  if (!row) throw notFound("Link nicht gefunden");
  await requireManageProfile(u.id, row.profileId);
  await db.update(shareLink).set({ revokedAt: new Date() }).where(eq(shareLink.id, row.id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Gast-Zugriff (ohne Konto) – Identität = Link
// ---------------------------------------------------------------------------

/** Gültigen Link laden. Der angemeldete Besitzer selbst darf seine Liste hier nicht ansehen. */
async function loadShare(c: Context<AppEnv>) {
  const [row] = await db
    .select({ link: shareLink, profile })
    .from(shareLink)
    .innerJoin(profile, eq(profile.id, shareLink.profileId))
    .where(and(eq(shareLink.token, c.req.param("token")!), activeCondition()));
  if (!row) throw notFound("Dieser Link ist ungültig oder wurde zurückgezogen");
  const u = c.get("user");
  if (u && row.profile.userId === u.id) {
    throw new HTTPException(403, {
      message: "Das ist deine eigene Wunschliste. Damit die Überraschung bleibt, kannst du sie über den geteilten Link nicht ansehen.",
    });
  }
  return row;
}

/** Wünsche, die Gäste sehen dürfen: aktiv und für alle Gruppen sichtbar */
const guestVisible = (profileId: string) =>
  and(eq(wish.profileId, profileId), eq(wish.status, "active"), eq(wish.visibleInAllGroups, true));

async function linksFor(ids: string[]) {
  return ids.length ? db.select().from(wishLink).where(inArray(wishLink.wishId, ids)).orderBy(asc(wishLink.sortOrder)) : [];
}

shareRoutes.get("/share/:token", async (c) => {
  const { link, profile: p } = await loadShare(c);

  const wishes = await db.select().from(wish).where(guestVisible(p.id)).orderBy(asc(wish.sortOrder), desc(wish.createdAt));
  const ids = wishes.map((w) => w.id);
  const reservations = ids.length ? await db.select().from(reservation).where(inArray(reservation.wishId, ids)) : [];

  // Reservierungen dieses Links, auch für inzwischen archivierte/gelöschte Wünsche
  const mine = await db
    .select({ r: reservation, w: wish })
    .from(reservation)
    .innerJoin(wish, eq(wish.id, reservation.wishId))
    .where(eq(reservation.reservedByShareLinkId, link.id))
    .orderBy(asc(reservation.createdAt));

  const allIds = [...new Set([...ids, ...mine.map((m) => m.w.id)])];
  const [links, images] = await Promise.all([linksFor(allIds), imagesFor(allIds)]);
  const linksOf = (id: string) => links.filter((l) => l.wishId === id).map((l) => ({ id: l.id, url: l.url, label: l.label }));

  const body: ShareViewDto = {
    profile: { displayName: p.displayName },
    wishes: wishes.map((w): ViewWishDto => {
      const r = reservations.find((x) => x.wishId === w.id);
      const isMine = r?.reservedByShareLinkId === link.id;
      return {
        id: w.id,
        title: w.title,
        description: w.description,
        priceCents: w.priceCents,
        links: linksOf(w.id),
        images: images.get(w.id) ?? [],
        reservation: !r ? "available" : isMine ? "reserved_by_me" : "reserved",
        changedSinceReservation: isMine ? isChanged(w, r) : false,
      };
    }),
    myReservations: mine.map(({ r, w }): GuestReservationDto => ({
      wishId: w.id,
      title: w.title,
      priceCents: w.priceCents,
      links: linksOf(w.id),
      images: w.status === "active" && w.visibleInAllGroups ? (images.get(w.id) ?? []) : [],
      state: w.status === "deleted" ? "deleted" : w.status === "archived" ? "archived" : isChanged(w, r) ? "changed" : "ok",
    })),
  };
  return c.json(body);
});

shareRoutes.post("/share/:token/wishes/:wishId/reserve", async (c) => {
  const { link, profile: p } = await loadShare(c);
  const [w] = await db
    .select()
    .from(wish)
    .where(and(eq(wish.id, c.req.param("wishId")), guestVisible(p.id)));
  if (!w) throw notFound("Wunsch nicht gefunden");
  const inserted = await db.insert(reservation).values({ wishId: w.id, reservedByShareLinkId: link.id }).onConflictDoNothing().returning();
  if (inserted.length === 0) {
    const [existing] = await db.select().from(reservation).where(eq(reservation.wishId, w.id));
    if (existing?.reservedByShareLinkId === link.id) return c.json({ ok: true });
    throw new HTTPException(409, { message: "Dieser Wunsch wurde gerade von jemand anderem reserviert" });
  }
  return c.json({ ok: true }, 201);
});

shareRoutes.delete("/share/:token/wishes/:wishId/reserve", async (c) => {
  const { link } = await loadShare(c);
  const wishId = c.req.param("wishId");
  const deleted = await db
    .delete(reservation)
    .where(and(eq(reservation.wishId, wishId), eq(reservation.reservedByShareLinkId, link.id)))
    .returning();
  if (deleted.length === 0) throw notFound("Reservierung nicht gefunden");
  const gone = await db
    .delete(wish)
    .where(and(eq(wish.id, wishId), eq(wish.status, "deleted")))
    .returning({ id: wish.id });
  if (gone.length > 0) await removeWishFiles(wishId);
  return c.json({ ok: true });
});

shareRoutes.post("/share/:token/reservations/:wishId/acknowledge", async (c) => {
  const { link } = await loadShare(c);
  const updated = await db
    .update(reservation)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(reservation.wishId, c.req.param("wishId")), eq(reservation.reservedByShareLinkId, link.id)))
    .returning();
  if (updated.length === 0) throw notFound("Reservierung nicht gefunden");
  return c.json({ ok: true });
});

/** Bilder für Gäste: nur von sichtbaren Wünschen oder von Wünschen, die über diesen Link reserviert sind */
async function serveGuestImage(c: Context<AppEnv>, size: "full" | "thumb") {
  const { link, profile: p } = await loadShare(c);
  const [row] = await db
    .select({ img: wishImage, w: wish })
    .from(wishImage)
    .innerJoin(wish, eq(wish.id, wishImage.wishId))
    .where(and(eq(wishImage.id, c.req.param("imageId")!), eq(wish.profileId, p.id)));
  if (!row) throw notFound("Bild nicht gefunden");
  const allowed =
    (row.w.status === "active" && row.w.visibleInAllGroups) ||
    (
      await db
        .select({ id: reservation.wishId })
        .from(reservation)
        .where(and(eq(reservation.wishId, row.w.id), eq(reservation.reservedByShareLinkId, link.id)))
    ).length > 0;
  if (!allowed) throw notFound("Bild nicht gefunden");
  const data = await readFile(resolveUpload(size === "thumb" ? row.img.thumbPath : row.img.filePath)).catch(() => null);
  if (!data) throw notFound("Bild nicht gefunden");
  return c.body(data, 200, {
    "Content-Type": "image/webp",
    "Cache-Control": "private, max-age=604800, immutable",
    "X-Content-Type-Options": "nosniff",
  });
}

shareRoutes.get("/share/:token/images/:imageId", (c) => serveGuestImage(c, "full"));
shareRoutes.get("/share/:token/images/:imageId/thumb", (c) => serveGuestImage(c, "thumb"));
