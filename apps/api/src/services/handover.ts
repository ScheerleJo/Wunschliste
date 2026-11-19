import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { profile, profileHandover } from "../db/schema.ts";

/** Gültige, offene Übergabe zu einem Token (oder null) */
export async function loadHandover(token: string) {
  const [h] = await db
    .select({ h: profileHandover, p: profile })
    .from(profileHandover)
    .innerJoin(profile, eq(profile.id, profileHandover.profileId))
    .where(eq(profileHandover.token, token));
  if (!h) return null;
  const valid = !h.h.completedAt && h.h.expiresAt > new Date() && h.p.userId === null;
  return { ...h, valid };
}

