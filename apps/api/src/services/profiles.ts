import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { profile } from "../db/schema.ts";

/** Eigenes Profil des Benutzers (wird bei Bedarf angelegt). */
export async function getOwnProfile(user: { id: string; name: string }) {
  const [own] = await db.select().from(profile).where(eq(profile.userId, user.id));
  if (own) return own;
  const [created] = await db
    .insert(profile)
    .values({ displayName: user.name, userId: user.id })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db.select().from(profile).where(eq(profile.userId, user.id));
  return again!;
}
