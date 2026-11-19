import { Hono } from "hono";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { reorderSchema, wishInputSchema, type OwnWishDto, type ProfileGroupDto } from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { group, groupMember, reservation, wish, wishLink, wishVisibility } from "../db/schema.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { badRequest, notFound, parseJson } from "../lib/http.ts";
import { requireManageProfile } from "../services/access.ts";
import { imagesFor, removeWishFiles } from "../services/images.ts";

export const wishRoutes = new Hono<AppEnv>();

type WishRow = typeof wish.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Baut die Besitzer-Sicht. Reservierungen werden hier bewusst NICHT geladen. */
async function toOwnDtos(rows: WishRow[]): Promise<OwnWishDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((w) => w.id);
  const [links, visibility, images] = await Promise.all([
    db.select().from(wishLink).where(inArray(wishLink.wishId, ids)).orderBy(asc(wishLink.sortOrder)),
    db.select().from(wishVisibility).where(inArray(wishVisibility.wishId, ids)),
    imagesFor(ids),
  ]);
  return rows.map((w) => ({
    id: w.id,
    title: w.title,
    description: w.description,
    priceCents: w.priceCents,
    links: links.filter((l) => l.wishId === w.id).map((l) => ({ id: l.id, url: l.url, label: l.label })),
    images: images.get(w.id) ?? [],
    visibleInAllGroups: w.visibleInAllGroups,
    groupIds: visibility.filter((v) => v.wishId === w.id).map((v) => v.groupId),
    status: w.status === "archived" ? "archived" : "active",
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    archivedAt: w.archivedAt?.toISOString() ?? null,
  }));
}

async function profileGroupIds(profileId: string) {
  const rows = await db.select({ id: groupMember.groupId }).from(groupMember).where(eq(groupMember.profileId, profileId));
  return new Set(rows.map((r) => r.id));
}

/** Lädt einen Wunsch, den der Benutzer verwalten darf (sonst 404). Gelöschte Wünsche zählen nicht. */
export async function loadManagedWish(userId: string, wishId: string) {
  const [w] = await db
    .select()
    .from(wish)
    .where(and(eq(wish.id, wishId), ne(wish.status, "deleted")));
  if (!w) throw notFound("Wunsch nicht gefunden");
  await requireManageProfile(userId, w.profileId);
  return w;
}

async function writeLinksAndVisibility(
  tx: Tx,
  wishId: string,
  profileId: string,
  input: { links: { url: string; label?: string | null }[]; visibleInAllGroups: boolean; groupIds: string[] },
) {
  await tx.delete(wishLink).where(eq(wishLink.wishId, wishId));
  if (input.links.length > 0) {
    await tx.insert(wishLink).values(input.links.map((l, i) => ({ wishId, url: l.url, label: l.label || null, sortOrder: i })));
  }
  await tx.delete(wishVisibility).where(eq(wishVisibility.wishId, wishId));
  if (!input.visibleInAllGroups) {
    // Nur Gruppen zulassen, in denen das Profil tatsächlich Mitglied ist
    const allowed = await profileGroupIds(profileId);
    const groupIds = [...new Set(input.groupIds)].filter((id) => allowed.has(id));
    if (groupIds.length !== new Set(input.groupIds).size) throw badRequest("Ungültige Gruppenauswahl");
    if (groupIds.length > 0) await tx.insert(wishVisibility).values(groupIds.map((groupId) => ({ wishId, groupId })));
  }
}

// ---------------------------------------------------------------------------

/** Wunschliste eines Profils, das ich verwalte (aktive oder archivierte Wünsche) */
wishRoutes.get("/profiles/:profileId/wishes", async (c) => {
  const u = requireUser(c);
  const profileId = c.req.param("profileId");
  await requireManageProfile(u.id, profileId);
  const status = c.req.query("status") === "archived" ? "archived" : "active";
  const rows = await db
    .select()
    .from(wish)
    .where(and(eq(wish.profileId, profileId), eq(wish.status, status)))
    .orderBy(...(status === "archived" ? [desc(wish.archivedAt)] : [asc(wish.sortOrder), desc(wish.createdAt)]));
  return c.json(await toOwnDtos(rows));
});

/** Gruppen des Profils (für die Sichtbarkeitsauswahl) */
wishRoutes.get("/profiles/:profileId/groups", async (c) => {
  const u = requireUser(c);
  const profileId = c.req.param("profileId");
  await requireManageProfile(u.id, profileId);
  const rows = await db
    .select({ id: group.id, name: group.name })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(eq(groupMember.profileId, profileId))
    .orderBy(asc(group.name));
  return c.json(rows satisfies ProfileGroupDto[]);
});

/** Neuen Wunsch anlegen (landet oben auf der Liste) */
wishRoutes.post("/profiles/:profileId/wishes", async (c) => {
  const u = requireUser(c);
  const profileId = c.req.param("profileId");
  await requireManageProfile(u.id, profileId);
  const input = await parseJson(c, wishInputSchema);

  const created = await db.transaction(async (tx) => {
    const [{ min } = { min: 0 }] = await tx
      .select({ min: sql<number>`coalesce(min(${wish.sortOrder}), 0)` })
      .from(wish)
      .where(eq(wish.profileId, profileId));
    const [w] = await tx
      .insert(wish)
      .values({
        profileId,
        title: input.title,
        description: input.description || null,
        priceCents: input.priceCents ?? null,
        visibleInAllGroups: input.visibleInAllGroups,
        sortOrder: Number(min) - 1,
      })
      .returning();
    await writeLinksAndVisibility(tx, w!.id, profileId, input);
    return w!;
  });
  const [dto] = await toOwnDtos([created]);
  return c.json(dto, 201);
});

/** Wunsch bearbeiten */
wishRoutes.patch("/wishes/:wishId", async (c) => {
  const u = requireUser(c);
  const w = await loadManagedWish(u.id, c.req.param("wishId"));
  const input = await parseJson(c, wishInputSchema);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(wish)
      .set({
        title: input.title,
        description: input.description || null,
        priceCents: input.priceCents ?? null,
        visibleInAllGroups: input.visibleInAllGroups,
      })
      .where(eq(wish.id, w.id))
      .returning();
    await writeLinksAndVisibility(tx, w.id, w.profileId, input);
    return row!;
  });
  const [dto] = await toOwnDtos([updated]);
  return c.json(dto);
});

/** Archivieren (z. B. nach dem Fest) */
wishRoutes.post("/wishes/:wishId/archive", async (c) => {
  const u = requireUser(c);
  const w = await loadManagedWish(u.id, c.req.param("wishId"));
  await db.update(wish).set({ status: "archived", archivedAt: new Date(), updatedAt: sql`${wish.updatedAt}` }).where(eq(wish.id, w.id));
  return c.json({ ok: true });
});

/** Aus dem Archiv zurückholen (wieder oben auf der Liste) */
wishRoutes.post("/wishes/:wishId/restore", async (c) => {
  const u = requireUser(c);
  const w = await loadManagedWish(u.id, c.req.param("wishId"));
  const [{ min } = { min: 0 }] = await db
    .select({ min: sql<number>`coalesce(min(${wish.sortOrder}), 0)` })
    .from(wish)
    .where(eq(wish.profileId, w.profileId));
  await db
    .update(wish)
    .set({ status: "active", archivedAt: null, sortOrder: Number(min) - 1, updatedAt: sql`${wish.updatedAt}` })
    .where(eq(wish.id, w.id));
  return c.json({ ok: true });
});

/**
 * Löschen. Ist der Wunsch reserviert, wird er nur als gelöscht markiert, damit der Reservierende
 * einen Hinweis bekommt. Die Antwort ist in beiden Fällen identisch: Der Besitzer soll daraus
 * nicht ablesen können, ob reserviert war.
 */
wishRoutes.delete("/wishes/:wishId", async (c) => {
  const u = requireUser(c);
  const w = await loadManagedWish(u.id, c.req.param("wishId"));
  const [res] = await db.select({ wishId: reservation.wishId }).from(reservation).where(eq(reservation.wishId, w.id));
  if (res) {
    await db.update(wish).set({ status: "deleted", deletedAt: new Date() }).where(eq(wish.id, w.id));
  } else {
    await db.delete(wish).where(eq(wish.id, w.id));
    await removeWishFiles(w.id);
  }
  return c.json({ ok: true });
});

/** Reihenfolge der aktiven Wünsche speichern */
wishRoutes.put("/profiles/:profileId/wishes/order", async (c) => {
  const u = requireUser(c);
  const profileId = c.req.param("profileId");
  await requireManageProfile(u.id, profileId);
  const { ids } = await parseJson(c, reorderSchema);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx
        .update(wish)
        .set({ sortOrder: i, updatedAt: sql`${wish.updatedAt}` }) // Umsortieren zählt nicht als Änderung
        .where(and(eq(wish.id, id), eq(wish.profileId, profileId)));
    }
  });
  return c.json({ ok: true });
});
