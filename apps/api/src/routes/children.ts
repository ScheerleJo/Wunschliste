/**
 * Kinderprofile: Profile ohne eigenes Konto, die von Erziehungsberechtigten verwaltet werden,
 * bis sie per Übergabe an ein eigenes Konto des Kindes gehen.
 */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { and, asc, count, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  childInputSchema,
  handoverInputSchema,
  type ChildDetailDto,
  type HandoverPreviewDto,
  type PersonDto,
  type ProfileDto,
} from "@wunschliste/shared";
import { z } from "zod";
import { db } from "../db/index.ts";
import { group, groupMember, profile, profileGuardian, profileHandover, user, wish } from "../db/schema.ts";
import { env } from "../env.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { badRequest, forbidden, notFound, parseJson } from "../lib/http.ts";
import { linkMail, sendMail } from "../mail.ts";
import { removeWishFiles } from "../services/images.ts";
import { getMembership } from "../services/groups.ts";
import { getOwnProfile } from "../services/profiles.ts";
import { handleNewGroupMember } from "../services/event-membership.ts";
import { loadHandover } from "../services/handover.ts";

export const childRoutes = new Hono<AppEnv>();

const HANDOVER_DAYS = 14;
export const handoverUrl = (token: string) => `${env.appUrl}/uebergabe/${token}`;

/** Lädt ein Kinderprofil, das der Benutzer verwaltet (sonst 404). */
async function requireGuardian(userId: string, profileId: string) {
  const [row] = await db
    .select({ p: profile })
    .from(profileGuardian)
    .innerJoin(profile, eq(profile.id, profileGuardian.profileId))
    .where(and(eq(profileGuardian.profileId, profileId), eq(profileGuardian.guardianUserId, userId), isNull(profile.userId)));
  if (!row) throw notFound("Kinderprofil nicht gefunden");
  return row.p;
}

/** Personen mit Konto, die mit mir in mindestens einer Gruppe sind */
async function peopleInMyGroups(myProfileId: string) {
  const mine = alias(groupMember, "mine");
  const theirs = alias(groupMember, "theirs");
  return db
    .selectDistinct({ userId: user.id, name: user.name })
    .from(mine)
    .innerJoin(theirs, eq(theirs.groupId, mine.groupId))
    .innerJoin(profile, eq(profile.id, theirs.profileId))
    .innerJoin(user, eq(user.id, profile.userId))
    .where(and(eq(mine.profileId, myProfileId), ne(theirs.profileId, myProfileId)))
    .orderBy(asc(user.name));
}

async function pendingHandover(profileId: string) {
  const [h] = await db
    .select()
    .from(profileHandover)
    .where(and(eq(profileHandover.profileId, profileId), isNull(profileHandover.completedAt), gt(profileHandover.expiresAt, new Date())));
  return h ?? null;
}

// ---------------------------------------------------------------------------

/** Kinderprofil anlegen; ich werde Erziehungsberechtigte(r) */
childRoutes.post("/children", async (c) => {
  const u = requireUser(c);
  const { displayName } = await parseJson(c, childInputSchema);
  const created = await db.transaction(async (tx) => {
    const [p] = await tx.insert(profile).values({ displayName }).returning();
    await tx.insert(profileGuardian).values({ profileId: p!.id, guardianUserId: u.id });
    return p!;
  });
  return c.json({ id: created.id, displayName: created.displayName, managed: true } satisfies ProfileDto, 201);
});

childRoutes.get("/children/:profileId", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const [guardians, groups, handover] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name })
      .from(profileGuardian)
      .innerJoin(user, eq(user.id, profileGuardian.guardianUserId))
      .where(eq(profileGuardian.profileId, p.id))
      .orderBy(asc(user.name)),
    db
      .select({ id: group.id, name: group.name })
      .from(groupMember)
      .innerJoin(group, eq(group.id, groupMember.groupId))
      .where(eq(groupMember.profileId, p.id))
      .orderBy(asc(group.name)),
    pendingHandover(p.id),
  ]);
  const body: ChildDetailDto = {
    id: p.id,
    displayName: p.displayName,
    guardians: guardians.map((g) => ({ ...g, isMe: g.userId === u.id })),
    groups,
    pendingHandover: handover ? { email: handover.email, expiresAt: handover.expiresAt.toISOString() } : null,
  };
  return c.json(body);
});

childRoutes.patch("/children/:profileId", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const { displayName } = await parseJson(c, childInputSchema);
  await db.update(profile).set({ displayName }).where(eq(profile.id, p.id));
  return c.json({ ok: true });
});

/** Kinderprofil samt Wunschliste löschen */
childRoutes.delete("/children/:profileId", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const wishIds = (await db.select({ id: wish.id }).from(wish).where(eq(wish.profileId, p.id))).map((w) => w.id);
  await db.delete(profile).where(eq(profile.id, p.id));
  await Promise.all(wishIds.map(removeWishFiles));
  return c.json({ ok: true });
});

// ---- Erziehungsberechtigte ---------------------------------------------------

/** Wen kann ich als weitere(n) Erziehungsberechtigte(n) hinzufügen? (Personen aus meinen Gruppen) */
childRoutes.get("/children/:profileId/guardian-candidates", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const me = await getOwnProfile(u);
  const existing = new Set(
    (await db.select().from(profileGuardian).where(eq(profileGuardian.profileId, p.id))).map((g) => g.guardianUserId),
  );
  const people = await peopleInMyGroups(me.id);
  return c.json(people.filter((x) => !existing.has(x.userId)) satisfies PersonDto[]);
});

childRoutes.post("/children/:profileId/guardians", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const { userId } = await parseJson(c, z.object({ userId: z.string() }));
  const me = await getOwnProfile(u);
  if (!(await peopleInMyGroups(me.id)).some((x) => x.userId === userId)) {
    throw badRequest("Diese Person ist in keiner deiner Gruppen");
  }
  await db.insert(profileGuardian).values({ profileId: p.id, guardianUserId: userId }).onConflictDoNothing();
  return c.json({ ok: true });
});

childRoutes.delete("/children/:profileId/guardians/:userId", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(profileGuardian).where(eq(profileGuardian.profileId, p.id));
  if (n <= 1) throw badRequest("Ein Kinderprofil braucht mindestens eine verwaltende Person. Lösche es stattdessen.");
  const removed = await db
    .delete(profileGuardian)
    .where(and(eq(profileGuardian.profileId, p.id), eq(profileGuardian.guardianUserId, c.req.param("userId"))))
    .returning();
  if (removed.length === 0) throw notFound("Nicht gefunden");
  return c.json({ ok: true });
});

// ---- Gruppen -----------------------------------------------------------------

/** Kind in eine Gruppe aufnehmen, in der ich selbst Mitglied bin */
childRoutes.post("/children/:profileId/groups", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const { groupId } = await parseJson(c, z.object({ groupId: z.string() }));
  const me = await getOwnProfile(u);
  if (!(await getMembership(groupId, me.id))) throw forbidden("Du kannst dein Kind nur in deine eigenen Gruppen aufnehmen");
  const inserted = await db.insert(groupMember).values({ groupId, profileId: p.id, role: "member" }).onConflictDoNothing().returning();
  if (inserted.length > 0) await handleNewGroupMember(groupId, p.id, u.id);
  return c.json({ ok: true });
});

childRoutes.delete("/children/:profileId/groups/:groupId", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  await db.delete(groupMember).where(and(eq(groupMember.groupId, c.req.param("groupId")), eq(groupMember.profileId, p.id)));
  return c.json({ ok: true });
});

// ---- Übergabe an ein eigenes Konto --------------------------------------------

childRoutes.post("/children/:profileId/handover", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  const email = (await parseJson(c, handoverInputSchema)).email.toLowerCase();

  const token = randomBytes(24).toString("base64url");
  await db.transaction(async (tx) => {
    // nur eine offene Übergabe gleichzeitig
    await tx
      .update(profileHandover)
      .set({ expiresAt: new Date() })
      .where(and(eq(profileHandover.profileId, p.id), isNull(profileHandover.completedAt)));
    await tx.insert(profileHandover).values({
      profileId: p.id,
      email,
      token,
      createdByUserId: u.id,
      expiresAt: new Date(Date.now() + HANDOVER_DAYS * 24 * 60 * 60 * 1000),
    });
  });
  await sendMail(
    linkMail(
      email,
      `${p.displayName}, deine Wunschliste gehört jetzt dir`,
      `Hallo ${p.displayName}! ${u.name} übergibt dir deine Wunschliste. Mit dem Link legst du dein eigenes Konto an (oder meldest dich an) und verwaltest deine Wünsche ab jetzt selbst. Der Link ist ${HANDOVER_DAYS} Tage gültig.`,
      "Wunschliste übernehmen",
      handoverUrl(token),
    ),
  );
  return c.json({ ok: true }, 201);
});

childRoutes.delete("/children/:profileId/handover", async (c) => {
  const u = requireUser(c);
  const p = await requireGuardian(u.id, c.req.param("profileId"));
  await db
    .update(profileHandover)
    .set({ expiresAt: new Date() })
    .where(and(eq(profileHandover.profileId, p.id), isNull(profileHandover.completedAt)));
  return c.json({ ok: true });
});

/** Vorschau für die Übergabeseite (ohne Anmeldung) */
childRoutes.get("/handover/:token", async (c) => {
  const h = await loadHandover(c.req.param("token"));
  if (!h) throw notFound("Übergabe nicht gefunden");
  const guardians = await db
    .select({ name: user.name })
    .from(profileGuardian)
    .innerJoin(user, eq(user.id, profileGuardian.guardianUserId))
    .where(eq(profileGuardian.profileId, h.p.id));
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(wish)
    .where(and(eq(wish.profileId, h.p.id), eq(wish.status, "active")));
  const body: HandoverPreviewDto = {
    childName: h.p.displayName,
    guardianNames: guardians.map((g) => g.name),
    email: h.h.email,
    valid: h.valid,
    wishCount: n,
  };
  return c.json(body);
});

/**
 * Übergabe annehmen: Das Kinderprofil gehört ab jetzt dem angemeldeten Konto.
 * Das automatisch angelegte (meist leere) Profil des Kontos wird mit dem Kinderprofil zusammengeführt:
 * Wünsche und Gruppen wandern mit, danach wird es gelöscht. Die Eltern verlieren den Verwaltungszugriff.
 */
childRoutes.post("/handover/:token/accept", async (c) => {
  const u = requireUser(c);
  const h = await loadHandover(c.req.param("token"));
  if (!h) throw notFound("Übergabe nicht gefunden");
  if (!h.valid) throw badRequest("Dieser Übergabelink ist nicht mehr gültig");
  if (h.h.email !== u.email.toLowerCase()) throw forbidden("Diese Übergabe gilt für eine andere E-Mail-Adresse");

  const child = h.p;
  const own = await getOwnProfile(u);
  await db.transaction(async (tx) => {
    // Gruppen und Wünsche des bisherigen eigenen Profils übernehmen
    const ownMemberships = await tx.select().from(groupMember).where(eq(groupMember.profileId, own.id));
    for (const m of ownMemberships) {
      await tx
        .insert(groupMember)
        .values({ groupId: m.groupId, profileId: child.id, role: m.role, joinedAt: m.joinedAt })
        .onConflictDoUpdate({
          target: [groupMember.groupId, groupMember.profileId],
          set: { role: sql`CASE WHEN ${groupMember.role} = 'admin' OR excluded.role = 'admin' THEN 'admin'::group_role ELSE 'member'::group_role END` },
        });
    }
    await tx.update(wish).set({ profileId: child.id, updatedAt: sql`${wish.updatedAt}` }).where(eq(wish.profileId, own.id));
    // Verweise auf das alte Profil (Haushalte, Events) umhängen, soweit möglich; Rest fällt per Kaskade weg
    await tx.delete(profile).where(eq(profile.id, own.id));
    await tx.update(profile).set({ userId: u.id }).where(eq(profile.id, child.id));
    await tx.delete(profileGuardian).where(eq(profileGuardian.profileId, child.id));
    await tx.update(profileHandover).set({ completedAt: new Date() }).where(eq(profileHandover.id, h.h.id));
  });
  return c.json({ profileId: child.id });
});

/** Für die Gruppen-Ansicht: welche Profile verwalte ich? */
export async function managedProfileIds(userId: string, profileIds: string[]) {
  if (profileIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ id: profileGuardian.profileId })
    .from(profileGuardian)
    .where(and(eq(profileGuardian.guardianUserId, userId), inArray(profileGuardian.profileId, profileIds)));
  return new Set(rows.map((r) => r.id));
}
