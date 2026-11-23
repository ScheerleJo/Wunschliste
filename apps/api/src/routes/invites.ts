import { Hono } from "hono";
import { and, eq, isNull, or, sql, lt, gt } from "drizzle-orm";
import type { InvitePreviewDto, RegistrationStatusDto } from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { groupInvite, groupMember, user } from "../db/schema.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { badRequest, forbidden, notFound } from "../lib/http.ts";
import { getMembership } from "../services/groups.ts";
import { loadInvite } from "../services/invites.ts";
import { getOwnProfile } from "../services/profiles.ts";
import { handleNewGroupMember } from "../services/event-membership.ts";

export const inviteRoutes = new Hono<AppEnv>();

/** Vorschau einer Einladung, auch ohne Anmeldung abrufbar */
inviteRoutes.get("/invites/:token", async (c) => {
  const inv = await loadInvite(c.req.param("token"));
  if (!inv) throw notFound("Einladung nicht gefunden");

  let alreadyMember = false;
  const u = c.get("user");
  if (u) {
    const me = await getOwnProfile(u);
    alreadyMember = (await getMembership(inv.invite.groupId, me.id)) !== null;
  }

  const body: InvitePreviewDto = {
    groupName: inv.groupName,
    invitedByName: inv.invitedByName,
    email: inv.invite.email,
    valid: inv.valid,
    reason: inv.reason,
    alreadyMember,
  };
  return c.json(body);
});

/** Einladung annehmen: eigenes Profil tritt der Gruppe bei */
inviteRoutes.post("/invites/:token/accept", async (c) => {
  const u = requireUser(c);
  const me = await getOwnProfile(u);
  const inv = await loadInvite(c.req.param("token"));
  if (!inv) throw notFound("Einladung nicht gefunden");
  const groupId = inv.invite.groupId;

  if (await getMembership(groupId, me.id)) return c.json({ groupId, alreadyMember: true });
  if (!inv.valid) throw badRequest("Diese Einladung ist nicht mehr gültig");
  if (inv.invite.email && inv.invite.email !== u.email.toLowerCase()) {
    throw forbidden("Diese Einladung gilt für eine andere E-Mail-Adresse");
  }

  await db.transaction(async (tx) => {
    // Nutzung atomar hochzählen, damit ein Link mit Limit nicht überbucht wird
    const updated = await tx
      .update(groupInvite)
      .set({ useCount: sql`${groupInvite.useCount} + 1` })
      .where(
        and(
          eq(groupInvite.id, inv.invite.id),
          isNull(groupInvite.revokedAt),
          gt(groupInvite.expiresAt, new Date()),
          or(isNull(groupInvite.maxUses), lt(groupInvite.useCount, groupInvite.maxUses)),
        ),
      )
      .returning({ id: groupInvite.id });
    if (updated.length === 0) throw badRequest("Diese Einladung ist nicht mehr gültig");
    await tx.insert(groupMember).values({ groupId, profileId: me.id, role: "member" }).onConflictDoNothing();
  });

  // Laufende Events: automatisch hinzufügen oder Organisatoren benachrichtigen
  await handleNewGroupMember(groupId, me.id, u.id);
  return c.json({ groupId, alreadyMember: false });
});

/** Ob noch die Ersteinrichtung läuft (dann ist Registrierung ohne Einladung erlaubt) */
inviteRoutes.get("/registration-status", async (c) => {
  const [any] = await db.select({ id: user.id }).from(user).limit(1);
  return c.json({ firstUser: !any } satisfies RegistrationStatusDto);
});
