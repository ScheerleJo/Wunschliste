import { and, eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { groupMember } from "../db/schema.ts";
import { forbidden, notFound } from "../lib/http.ts";

export async function getMembership(groupId: string, profileId: string) {
  const [m] = await db
    .select()
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.profileId, profileId)));
  return m ?? null;
}

/** Wirft 404, wenn das Profil nicht Mitglied ist (Gruppe soll für Fremde nicht existieren). */
export async function requireMember(groupId: string, profileId: string) {
  const m = await getMembership(groupId, profileId);
  if (!m) throw notFound("Gruppe nicht gefunden");
  return m;
}

export async function requireAdmin(groupId: string, profileId: string) {
  const m = await requireMember(groupId, profileId);
  if (m.role !== "admin") throw forbidden("Nur Gruppen-Admins dürfen das");
  return m;
}
