/**
 * Zentrale Sichtbarkeitsregeln. Alle Lesezugriffe auf fremde Wunschlisten laufen hierüber.
 *
 * Ein Wunsch W von Profil P ist für das Betrachter-Profil V sichtbar, wenn
 *  - V ≠ P,
 *  - W aktiv ist (nicht archiviert/gelöscht) und
 *  - es eine Gruppe G gibt, in der P und V Mitglied sind, und W in G sichtbar ist
 *    (visibleInAllGroups oder G steht in wish_visibility).
 */
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/index.ts";
import { group, groupMember, wish, wishVisibility } from "../db/schema.ts";

/** Gruppen, in denen beide Profile Mitglied sind */
export async function sharedGroups(viewerProfileId: string, targetProfileId: string) {
  if (viewerProfileId === targetProfileId) return [];
  const mine = alias(groupMember, "mine");
  const theirs = alias(groupMember, "theirs");
  return db
    .select({ id: group.id, name: group.name })
    .from(mine)
    .innerJoin(theirs, and(eq(theirs.groupId, mine.groupId), eq(theirs.profileId, targetProfileId)))
    .innerJoin(group, eq(group.id, mine.groupId))
    .where(eq(mine.profileId, viewerProfileId))
    .orderBy(group.name);
}

type WishRow = typeof wish.$inferSelect;

/** Filtert Wünsche (eines Profils) auf die, die über die gemeinsamen Gruppen sichtbar sind. */
export async function filterVisible<T extends Pick<WishRow, "id" | "visibleInAllGroups">>(
  wishes: T[],
  sharedGroupIds: string[],
): Promise<T[]> {
  if (sharedGroupIds.length === 0 || wishes.length === 0) return [];
  const restricted = wishes.filter((w) => !w.visibleInAllGroups).map((w) => w.id);
  const allowed = new Set<string>();
  if (restricted.length > 0) {
    const rows = await db
      .select({ wishId: wishVisibility.wishId })
      .from(wishVisibility)
      .where(and(inArray(wishVisibility.wishId, restricted), inArray(wishVisibility.groupId, sharedGroupIds)));
    for (const r of rows) allowed.add(r.wishId);
  }
  return wishes.filter((w) => w.visibleInAllGroups || allowed.has(w.id));
}

/** Darf das Betrachter-Profil diesen (aktiven) Wunsch sehen? */
export async function canViewWish(viewerProfileId: string, w: WishRow): Promise<boolean> {
  if (w.status !== "active") return false;
  const shared = await sharedGroups(viewerProfileId, w.profileId);
  const visible = await filterVisible([w], shared.map((g) => g.id));
  return visible.length === 1;
}
