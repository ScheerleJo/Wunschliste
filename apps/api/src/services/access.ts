import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.ts";
import { profile, profileGuardian } from "../db/schema.ts";
import { notFound } from "../lib/http.ts";

/**
 * Darf der Benutzer die Wunschliste dieses Profils bearbeiten?
 * Ja, wenn es sein eigenes Profil ist oder ein (noch) verwaltetes Kinderprofil, für das er
 * erziehungsberechtigt ist.
 */
export async function canManageProfile(userId: string, profileId: string): Promise<boolean> {
  const [p] = await db.select({ userId: profile.userId }).from(profile).where(eq(profile.id, profileId));
  if (!p) return false;
  if (p.userId === userId) return true;
  if (p.userId !== null) return false;
  const [g] = await db
    .select({ profileId: profileGuardian.profileId })
    .from(profileGuardian)
    .innerJoin(profile, eq(profile.id, profileGuardian.profileId))
    .where(and(eq(profileGuardian.profileId, profileId), eq(profileGuardian.guardianUserId, userId), isNull(profile.userId)));
  return !!g;
}

/** Wirft 404 (nicht 403), damit fremde Profile/Wünsche nicht "erraten" werden können. */
export async function requireManageProfile(userId: string, profileId: string) {
  if (!(await canManageProfile(userId, profileId))) throw notFound("Wunschliste nicht gefunden");
}
