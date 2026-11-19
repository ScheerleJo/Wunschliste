import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { InvitePreviewDto } from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { group, groupInvite, user } from "../db/schema.ts";
import { env } from "../env.ts";

export const newToken = () => randomBytes(24).toString("base64url");
export const inviteUrl = (token: string) => `${env.appUrl}/einladung/${token}`;

export type InviteState = NonNullable<Awaited<ReturnType<typeof loadInvite>>>;

/** Lädt eine Einladung samt Gruppe und prüft, ob sie noch gültig ist. */
export async function loadInvite(token: string) {
  const [row] = await db
    .select({ invite: groupInvite, groupName: group.name, invitedByName: user.name })
    .from(groupInvite)
    .innerJoin(group, eq(group.id, groupInvite.groupId))
    .innerJoin(user, eq(user.id, groupInvite.createdByUserId))
    .where(eq(groupInvite.token, token));
  if (!row) return null;

  let reason: InvitePreviewDto["reason"] = null;
  if (row.invite.revokedAt) reason = "revoked";
  else if (row.invite.expiresAt < new Date()) reason = "expired";
  else if (row.invite.maxUses !== null && row.invite.useCount >= row.invite.maxUses) reason = "used_up";

  return { ...row, valid: reason === null, reason };
}
