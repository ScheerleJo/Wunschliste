/**
 * System-Administration unter /api/admin.
 *
 * Bewusst NICHT enthalten: wer was reserviert hat und Wichtel-Zuordnungen. Der Admin ist selbst Teil der Familie,
 * und die Überraschung soll auch für ihn erhalten bleiben (für Notfälle gibt es die protokollierte Notfall-Einsicht).
 */
import { Hono } from "hono";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import {
  adminUserUpdateSchema,
  groupInputSchema,
  type AdminChildDto,
  type AdminEventDto,
  type AdminGroupDto,
  type AdminInviteDto,
  type AdminShareDto,
  type AdminStatsDto,
  type AdminUserDto,
} from "@wunschliste/shared";
import { z } from "zod";
import { auth } from "../auth.ts";
import { db } from "../db/index.ts";
import {
  account,
  event,
  eventParticipant,
  group,
  groupInvite,
  groupMember,
  profile,
  profileGuardian,
  profileHandover,
  session,
  shareLink,
  user,
  wish,
} from "../db/schema.ts";
import { env } from "../env.ts";
import { badRequest, notFound, parseJson } from "../lib/http.ts";
import { mailFrom } from "../mail.ts";
import { adminLogin, adminLogout, requireAdminSession, type AdminEnv } from "../services/admin-auth.ts";
import { handleNewGroupMember } from "../services/event-membership.ts";
import { removeWishFiles } from "../services/images.ts";

export const adminRoutes = new Hono<AdminEnv>();

// ---- Anmeldung (ohne Sitzung erreichbar) ----------------------------------------------

adminRoutes.post("/login", async (c) => {
  const { email, password } = await parseJson(c, z.object({ email: z.string().trim().min(1), password: z.string().min(1) }));
  return c.json(await adminLogin(c, email, password));
});

adminRoutes.post("/logout", async (c) => {
  await adminLogout(c);
  return c.json({ ok: true });
});

// ---- Ab hier nur mit Admin-Sitzung ------------------------------------------------------

adminRoutes.use("*", requireAdminSession);

adminRoutes.get("/me", (c) => c.json(c.get("admin")));

const today = () => new Date().toISOString().slice(0, 10);
const activeInvite = () =>
  and(
    isNull(groupInvite.revokedAt),
    gt(groupInvite.expiresAt, new Date()),
    or(isNull(groupInvite.maxUses), sql`${groupInvite.useCount} < ${groupInvite.maxUses}`),
  );
const activeShare = () => and(isNull(shareLink.revokedAt), or(isNull(shareLink.expiresAt), gt(shareLink.expiresAt, new Date())));
const num = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

adminRoutes.get("/stats", async (c) => {
  const body: AdminStatsDto = {
    users: await num(db.select({ n: count() }).from(user)),
    unverifiedUsers: await num(db.select({ n: count() }).from(user).where(eq(user.emailVerified, false))),
    childProfiles: await num(db.select({ n: count() }).from(profile).where(isNull(profile.userId))),
    groups: await num(db.select({ n: count() }).from(group)),
    activeWishes: await num(db.select({ n: count() }).from(wish).where(eq(wish.status, "active"))),
    upcomingEvents: await num(
      db
        .select({ n: count() })
        .from(event)
        .where(or(isNull(event.date), gte(event.date, today()))),
    ),
    activeShareLinks: await num(db.select({ n: count() }).from(shareLink).where(activeShare())),
    activeInvites: await num(db.select({ n: count() }).from(groupInvite).where(activeInvite())),
    mail: { configured: !!env.smtp.host, host: env.smtp.host ?? null, from: mailFrom },
  };
  return c.json(body);
});

// ---- Benutzer -------------------------------------------------------------------------

async function wishCounts(profileIds: string[]) {
  if (profileIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ id: wish.profileId, n: count() })
    .from(wish)
    .where(and(inArray(wish.profileId, profileIds), eq(wish.status, "active")))
    .groupBy(wish.profileId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

adminRoutes.get("/users", async (c) => {
  const users = await db.select().from(user).orderBy(asc(user.name));
  const profiles = await db.select().from(profile).where(isNotNull(profile.userId));
  const memberships = await db
    .select({ profileId: groupMember.profileId, id: group.id, name: group.name, role: groupMember.role })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId));
  const kids = await db
    .select({ userId: profileGuardian.guardianUserId, id: profile.id, displayName: profile.displayName })
    .from(profileGuardian)
    .innerJoin(profile, eq(profile.id, profileGuardian.profileId))
    .where(isNull(profile.userId));
  const lastActive = await db.select({ userId: session.userId, at: max(session.updatedAt) }).from(session).groupBy(session.userId);
  const wishes = await wishCounts(profiles.map((p) => p.id));

  const body: AdminUserDto[] = users.map((u) => {
    const p = profiles.find((x) => x.userId === u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: lastActive.find((s) => s.userId === u.id)?.at?.toISOString() ?? null,
      profileId: p?.id ?? null,
      wishCount: p ? (wishes.get(p.id) ?? 0) : 0,
      groups: p ? memberships.filter((m) => m.profileId === p.id).map(({ id, name, role }) => ({ id, name, role })) : [],
      children: kids.filter((k) => k.userId === u.id).map(({ id, displayName }) => ({ id, displayName })),
    };
  });
  return c.json(body);
});

async function loadUser(id: string) {
  const [u] = await db.select().from(user).where(eq(user.id, id));
  if (!u) throw notFound("Benutzer nicht gefunden");
  return u;
}

adminRoutes.patch("/users/:id", async (c) => {
  const u = await loadUser(c.req.param("id"));
  const input = await parseJson(c, adminUserUpdateSchema);
  const email = input.email?.toLowerCase();
  if (email && email !== u.email) {
    const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (taken) throw badRequest("Diese E-Mail-Adresse wird schon verwendet");
  }
  await db
    .update(user)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(email ? { email } : {}),
      ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
    })
    .where(eq(user.id, u.id));
  if (input.name) await db.update(profile).set({ displayName: input.name }).where(eq(profile.userId, u.id));
  return c.json({ ok: true });
});

/** Neues Passwort setzen; alle Sitzungen des Benutzers werden beendet */
adminRoutes.post("/users/:id/password", async (c) => {
  const u = await loadUser(c.req.param("id"));
  const { password } = await parseJson(c, z.object({ password: z.string().min(8, "Mindestens 8 Zeichen").max(128) }));
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const [credential] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
  if (credential) await db.update(account).set({ password: hash }).where(eq(account.id, credential.id));
  else await ctx.internalAdapter.linkAccount({ userId: u.id, providerId: "credential", accountId: u.id, password: hash });
  await db.delete(session).where(eq(session.userId, u.id));
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/logout", async (c) => {
  const u = await loadUser(c.req.param("id"));
  await db.delete(session).where(eq(session.userId, u.id));
  return c.json({ ok: true });
});

/**
 * Benutzer löschen: eigenes Profil samt Wünschen, Bildern, Gruppenmitgliedschaften und eigenen Reservierungen.
 * Kinderprofile, die nur dieser Benutzer verwaltet hat, bleiben bestehen (ohne Verwalter) und tauchen im
 * Bereich "Kinder" auf.
 */
adminRoutes.delete("/users/:id", async (c) => {
  const u = await loadUser(c.req.param("id"));
  const own = await db.select({ id: profile.id }).from(profile).where(eq(profile.userId, u.id));
  const wishIds = own.length ? (await db.select({ id: wish.id }).from(wish).where(inArray(wish.profileId, own.map((p) => p.id)))).map((w) => w.id) : [];
  await db.transaction(async (tx) => {
    if (own.length) await tx.delete(profile).where(inArray(profile.id, own.map((p) => p.id)));
    await tx.delete(user).where(eq(user.id, u.id));
  });
  await Promise.all(wishIds.map(removeWishFiles));
  return c.json({ ok: true });
});

// ---- Gruppen ----------------------------------------------------------------------------

adminRoutes.get("/groups", async (c) => {
  const groups = await db.select().from(group).orderBy(asc(group.name));
  const members = await db
    .select({ groupId: groupMember.groupId, profileId: profile.id, displayName: profile.displayName, role: groupMember.role, userId: profile.userId })
    .from(groupMember)
    .innerJoin(profile, eq(profile.id, groupMember.profileId))
    .orderBy(asc(profile.displayName));
  const events = await db.select({ groupId: event.groupId, n: count() }).from(event).groupBy(event.groupId);
  const body: AdminGroupDto[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    createdAt: g.createdAt.toISOString(),
    members: members
      .filter((m) => m.groupId === g.id)
      .map((m) => ({ profileId: m.profileId, displayName: m.displayName, role: m.role, managed: m.userId === null })),
    eventCount: events.find((e) => e.groupId === g.id)?.n ?? 0,
  }));
  return c.json(body);
});

async function loadGroup(id: string) {
  const [g] = await db.select().from(group).where(eq(group.id, id));
  if (!g) throw notFound("Gruppe nicht gefunden");
  return g;
}

adminRoutes.patch("/groups/:id", async (c) => {
  const g = await loadGroup(c.req.param("id"));
  const input = await parseJson(c, groupInputSchema);
  await db.update(group).set({ name: input.name, description: input.description || null }).where(eq(group.id, g.id));
  return c.json({ ok: true });
});

adminRoutes.delete("/groups/:id", async (c) => {
  const g = await loadGroup(c.req.param("id"));
  await db.delete(group).where(eq(group.id, g.id));
  return c.json({ ok: true });
});

/** Mitglied hinzufügen oder Rolle ändern */
adminRoutes.put("/groups/:id/members/:profileId", async (c) => {
  const g = await loadGroup(c.req.param("id"));
  const { role } = await parseJson(c, z.object({ role: z.enum(["admin", "member"]) }));
  const [p] = await db.select().from(profile).where(eq(profile.id, c.req.param("profileId")));
  if (!p) throw notFound("Person nicht gefunden");
  if (role === "admin" && !p.userId) throw badRequest("Kinderprofile ohne eigenes Konto können keine Admins sein");
  const inserted = await db.insert(groupMember).values({ groupId: g.id, profileId: p.id, role }).onConflictDoNothing().returning();
  if (inserted.length === 0) {
    await db
      .update(groupMember)
      .set({ role })
      .where(and(eq(groupMember.groupId, g.id), eq(groupMember.profileId, p.id)));
  } else {
    await handleNewGroupMember(g.id, p.id);
  }
  return c.json({ ok: true });
});

adminRoutes.delete("/groups/:id/members/:profileId", async (c) => {
  const g = await loadGroup(c.req.param("id"));
  await db.delete(groupMember).where(and(eq(groupMember.groupId, g.id), eq(groupMember.profileId, c.req.param("profileId"))));
  return c.json({ ok: true });
});

// ---- Einladungen & Teilen-Links --------------------------------------------------------------

adminRoutes.get("/invites", async (c) => {
  const rows = await db
    .select({ i: groupInvite, groupName: group.name, createdByName: user.name })
    .from(groupInvite)
    .innerJoin(group, eq(group.id, groupInvite.groupId))
    .innerJoin(user, eq(user.id, groupInvite.createdByUserId))
    .where(activeInvite())
    .orderBy(desc(groupInvite.createdAt));
  const body: AdminInviteDto[] = rows.map(({ i, groupName, createdByName }) => ({
    id: i.id,
    groupName,
    email: i.email,
    expiresAt: i.expiresAt.toISOString(),
    useCount: i.useCount,
    maxUses: i.maxUses,
    createdByName,
  }));
  return c.json(body);
});

adminRoutes.delete("/invites/:id", async (c) => {
  await db.update(groupInvite).set({ revokedAt: new Date() }).where(eq(groupInvite.id, c.req.param("id")));
  return c.json({ ok: true });
});

adminRoutes.get("/shares", async (c) => {
  const rows = await db
    .select({ s: shareLink, profileName: profile.displayName })
    .from(shareLink)
    .innerJoin(profile, eq(profile.id, shareLink.profileId))
    .where(activeShare())
    .orderBy(desc(shareLink.createdAt));
  const body: AdminShareDto[] = rows.map(({ s, profileName }) => ({
    id: s.id,
    label: s.label,
    profileName,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
  }));
  return c.json(body);
});

adminRoutes.delete("/shares/:id", async (c) => {
  await db.update(shareLink).set({ revokedAt: new Date() }).where(eq(shareLink.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Kinderprofile ------------------------------------------------------------------------

adminRoutes.get("/children", async (c) => {
  const kids = await db.select().from(profile).where(isNull(profile.userId)).orderBy(asc(profile.displayName));
  const ids = kids.map((k) => k.id);
  const [guardians, groups, handovers, wishes] = await Promise.all([
    ids.length
      ? db
          .select({ profileId: profileGuardian.profileId, userId: user.id, name: user.name })
          .from(profileGuardian)
          .innerJoin(user, eq(user.id, profileGuardian.guardianUserId))
          .where(inArray(profileGuardian.profileId, ids))
      : [],
    ids.length
      ? db
          .select({ profileId: groupMember.profileId, id: group.id, name: group.name })
          .from(groupMember)
          .innerJoin(group, eq(group.id, groupMember.groupId))
          .where(inArray(groupMember.profileId, ids))
      : [],
    ids.length
      ? db
          .select()
          .from(profileHandover)
          .where(and(inArray(profileHandover.profileId, ids), isNull(profileHandover.completedAt), gt(profileHandover.expiresAt, new Date())))
      : [],
    wishCounts(ids),
  ]);
  const body: AdminChildDto[] = kids.map((k) => ({
    id: k.id,
    displayName: k.displayName,
    wishCount: wishes.get(k.id) ?? 0,
    guardians: guardians.filter((g) => g.profileId === k.id).map(({ userId, name }) => ({ userId, name })),
    groups: groups.filter((g) => g.profileId === k.id).map(({ id, name }) => ({ id, name })),
    pendingHandoverEmail: handovers.find((h) => h.profileId === k.id)?.email ?? null,
  }));
  return c.json(body);
});

async function loadChild(id: string) {
  const [p] = await db
    .select()
    .from(profile)
    .where(and(eq(profile.id, id), isNull(profile.userId)));
  if (!p) throw notFound("Kinderprofil nicht gefunden");
  return p;
}

adminRoutes.post("/children/:id/guardians", async (c) => {
  const p = await loadChild(c.req.param("id"));
  const { userId } = await parseJson(c, z.object({ userId: z.string() }));
  await loadUser(userId);
  await db.insert(profileGuardian).values({ profileId: p.id, guardianUserId: userId }).onConflictDoNothing();
  return c.json({ ok: true });
});

adminRoutes.delete("/children/:id/guardians/:userId", async (c) => {
  const p = await loadChild(c.req.param("id"));
  await db
    .delete(profileGuardian)
    .where(and(eq(profileGuardian.profileId, p.id), eq(profileGuardian.guardianUserId, c.req.param("userId"))));
  return c.json({ ok: true });
});

adminRoutes.delete("/children/:id", async (c) => {
  const p = await loadChild(c.req.param("id"));
  const wishIds = (await db.select({ id: wish.id }).from(wish).where(eq(wish.profileId, p.id))).map((w) => w.id);
  await db.delete(profile).where(eq(profile.id, p.id));
  await Promise.all(wishIds.map(removeWishFiles));
  return c.json({ ok: true });
});

// ---- Events ---------------------------------------------------------------------------------

adminRoutes.get("/events", async (c) => {
  const rows = await db
    .select({ e: event, groupName: group.name, createdByName: user.name })
    .from(event)
    .innerJoin(group, eq(group.id, event.groupId))
    .leftJoin(user, eq(user.id, event.createdByUserId))
    .orderBy(desc(event.date), desc(event.createdAt));
  const parts = await db.select({ id: eventParticipant.eventId, n: count() }).from(eventParticipant).groupBy(eventParticipant.eventId);
  const body: AdminEventDto[] = rows.map(({ e, groupName, createdByName }) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    status: e.status,
    date: e.date,
    groupName,
    participantCount: parts.find((p) => p.id === e.id)?.n ?? 0,
    createdByName,
  }));
  return c.json(body);
});

adminRoutes.delete("/events/:id", async (c) => {
  await db.delete(event).where(eq(event.id, c.req.param("id")));
  return c.json({ ok: true });
});

