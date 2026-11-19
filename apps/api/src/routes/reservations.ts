import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { MyReservationDto, MyReservationState, ViewWishDto, WishlistViewDto } from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { profile, reservation, wish, wishLink } from "../db/schema.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { notFound } from "../lib/http.ts";
import { getOwnProfile } from "../services/profiles.ts";
import { imagesFor, removeWishFiles } from "../services/images.ts";
import { canViewWish, filterVisible, sharedGroups } from "../services/visibility.ts";

export const reservationRoutes = new Hono<AppEnv>();

async function linksFor(wishIds: string[]) {
  if (wishIds.length === 0) return [];
  return db.select().from(wishLink).where(inArray(wishLink.wishId, wishIds)).orderBy(asc(wishLink.sortOrder));
}

/** Wurde der Wunsch nach der Reservierung (bzw. nach dem letzten "Gesehen") inhaltlich geändert? */
function isChanged(w: { updatedAt: Date }, r: { createdAt: Date; acknowledgedAt: Date | null }) {
  const since = r.acknowledgedAt && r.acknowledgedAt > r.createdAt ? r.acknowledgedAt : r.createdAt;
  return w.updatedAt.getTime() > since.getTime();
}

/**
 * Wunschliste einer anderen Person aus Sicht eines Schenkenden.
 * Die eigene Liste ist hier bewusst nicht abrufbar (404), dafür gibt es die Besitzer-Sicht ohne Reservierungen.
 */
reservationRoutes.get("/profiles/:profileId/list", async (c) => {
  const u = requireUser(c);
  const me = await getOwnProfile(u);
  const profileId = c.req.param("profileId");

  const shared = await sharedGroups(me.id, profileId);
  if (shared.length === 0) throw notFound("Wunschliste nicht gefunden");
  const [p] = await db.select().from(profile).where(eq(profile.id, profileId));
  if (!p) throw notFound("Wunschliste nicht gefunden");

  const all = await db
    .select()
    .from(wish)
    .where(and(eq(wish.profileId, profileId), eq(wish.status, "active")))
    .orderBy(asc(wish.sortOrder), desc(wish.createdAt));
  const wishes = await filterVisible(all, shared.map((g) => g.id));
  const ids = wishes.map((w) => w.id);

  const [links, reservations, images] = await Promise.all([
    linksFor(ids),
    ids.length ? db.select().from(reservation).where(inArray(reservation.wishId, ids)) : Promise.resolve([]),
    imagesFor(ids),
  ]);

  const body: WishlistViewDto = {
    profile: { id: p.id, displayName: p.displayName, managed: p.userId === null },
    sharedGroups: shared,
    wishes: wishes.map((w): ViewWishDto => {
      const r = reservations.find((x) => x.wishId === w.id);
      const mine = r?.reservedByUserId === u.id;
      return {
        id: w.id,
        title: w.title,
        description: w.description,
        priceCents: w.priceCents,
        links: links.filter((l) => l.wishId === w.id).map((l) => ({ id: l.id, url: l.url, label: l.label })),
        images: images.get(w.id) ?? [],
        reservation: !r ? "available" : mine ? "reserved_by_me" : "reserved",
        changedSinceReservation: mine ? isChanged(w, r) : false,
      };
    }),
  };
  return c.json(body);
});

/** Wunsch reservieren */
reservationRoutes.post("/wishes/:wishId/reserve", async (c) => {
  const u = requireUser(c);
  const me = await getOwnProfile(u);
  const [w] = await db.select().from(wish).where(eq(wish.id, c.req.param("wishId")));
  if (!w || !(await canViewWish(me.id, w))) throw notFound("Wunsch nicht gefunden");

  const inserted = await db
    .insert(reservation)
    .values({ wishId: w.id, reservedByUserId: u.id })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    const [existing] = await db.select().from(reservation).where(eq(reservation.wishId, w.id));
    if (existing?.reservedByUserId === u.id) return c.json({ ok: true });
    throw new HTTPException(409, { message: "Dieser Wunsch wurde gerade von jemand anderem reserviert" });
  }
  return c.json({ ok: true }, 201);
});

/**
 * Eigene Reservierung aufheben. Funktioniert auch, wenn der Wunsch inzwischen archiviert, gelöscht oder
 * nicht mehr sichtbar ist. Ist der Wunsch gelöscht, wird er danach endgültig entfernt.
 */
reservationRoutes.delete("/wishes/:wishId/reserve", async (c) => {
  const u = requireUser(c);
  const wishId = c.req.param("wishId");
  const deleted = await db
    .delete(reservation)
    .where(and(eq(reservation.wishId, wishId), eq(reservation.reservedByUserId, u.id)))
    .returning();
  if (deleted.length === 0) throw notFound("Reservierung nicht gefunden");
  const gone = await db
    .delete(wish)
    .where(and(eq(wish.id, wishId), eq(wish.status, "deleted")))
    .returning({ id: wish.id });
  if (gone.length > 0) await removeWishFiles(wishId);
  return c.json({ ok: true });
});

/** Hinweis "wurde geändert" als gesehen markieren */
reservationRoutes.post("/reservations/:wishId/acknowledge", async (c) => {
  const u = requireUser(c);
  const updated = await db
    .update(reservation)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(reservation.wishId, c.req.param("wishId")), eq(reservation.reservedByUserId, u.id)))
    .returning();
  if (updated.length === 0) throw notFound("Reservierung nicht gefunden");
  return c.json({ ok: true });
});

/** Alle meine Reservierungen ("Was muss ich noch besorgen?") */
reservationRoutes.get("/reservations", async (c) => {
  const u = requireUser(c);
  const me = await getOwnProfile(u);
  const rows = await db
    .select({ r: reservation, w: wish, p: { id: profile.id, displayName: profile.displayName } })
    .from(reservation)
    .innerJoin(wish, eq(wish.id, reservation.wishId))
    .innerJoin(profile, eq(profile.id, wish.profileId))
    .where(eq(reservation.reservedByUserId, u.id))
    .orderBy(asc(profile.displayName), asc(reservation.createdAt));

  const links = await linksFor(rows.map((x) => x.w.id));
  const images = await imagesFor(rows.map((x) => x.w.id));
  const body: MyReservationDto[] = [];
  for (const { r, w, p } of rows) {
    let state: MyReservationState;
    if (w.status === "deleted") state = "deleted";
    else if (w.status === "archived") state = "archived";
    else if (!(await canViewWish(me.id, w))) state = "no_access";
    else state = isChanged(w, r) ? "changed" : "ok";

    body.push({
      wishId: w.id,
      title: w.title,
      priceCents: w.priceCents,
      links: links.filter((l) => l.wishId === w.id).map((l) => ({ id: l.id, url: l.url, label: l.label })),
      images: images.get(w.id) ?? [],
      profile: p,
      reservedAt: r.createdAt.toISOString(),
      state,
    });
  }
  return c.json(body);
});
