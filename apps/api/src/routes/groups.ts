import { Hono } from "hono";
import { and, asc, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  APP_NAME,
  createInviteSchema,
  groupInputSchema,
  updateMemberSchema,
  type GroupDetailDto,
  type GroupSummaryDto,
  type InviteDto,
} from "@wunschliste/shared";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { db } from "../db/index.ts";
import { group, groupInvite, groupMember, profile, user } from "../db/schema.ts";
import { badRequest, notFound, parseJson } from "../lib/http.ts";
import { linkMail, sendMail } from "../mail.ts";
import { requireAdmin, requireMember } from "../services/groups.ts";
import { inviteUrl, newToken } from "../services/invites.ts";
import { getOwnProfile } from "../services/profiles.ts";
import { managedProfileIds } from "./children.ts";

export const groupRoutes = new Hono<AppEnv>();

const memberCount = db
  .select({ groupId: groupMember.groupId, n: count().as("n") })
  .from(groupMember)
  .groupBy(groupMember.groupId)
  .as("member_count");

/** Meine Gruppen */
groupRoutes.get("/", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const rows = await db
    .select({
      id: group.id,
      name: group.name,
      description: group.description,
      myRole: groupMember.role,
      memberCount: memberCount.n,
    })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .innerJoin(memberCount, eq(memberCount.groupId, group.id))
    .where(eq(groupMember.profileId, me.id))
    .orderBy(asc(group.name));
  return c.json(rows satisfies GroupSummaryDto[]);
});

/** Neue Gruppe anlegen, der Ersteller wird Admin */
groupRoutes.post("/", async (c) => {
  const u = requireUser(c);
  const me = await getOwnProfile(u);
  const input = await parseJson(c, groupInputSchema);
  const created = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(group)
      .values({ name: input.name, description: input.description || null, createdByUserId: u.id })
      .returning();
    await tx.insert(groupMember).values({ groupId: g!.id, profileId: me.id, role: "admin" });
    return g!;
  });
  return c.json({ id: created.id }, 201);
});

/** Gruppe mit Mitgliedern */
groupRoutes.get("/:groupId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const groupId = c.req.param("groupId");
  const membership = await requireMember(groupId, me.id);
  const [g] = await db.select().from(group).where(eq(group.id, groupId));
  if (!g) throw notFound("Gruppe nicht gefunden");

  const members = await db
    .select({
      profileId: profile.id,
      displayName: profile.displayName,
      role: groupMember.role,
      userId: profile.userId,
      joinedAt: groupMember.joinedAt,
    })
    .from(groupMember)
    .innerJoin(profile, eq(profile.id, groupMember.profileId))
    .where(eq(groupMember.groupId, groupId))
    .orderBy(desc(sql`${groupMember.role} = 'admin'`), asc(profile.displayName));

  const mine = await managedProfileIds(
    requireUser(c).id,
    members.filter((m) => m.userId === null).map((m) => m.profileId),
  );
  const body: GroupDetailDto = {
    id: g.id,
    name: g.name,
    description: g.description,
    myRole: membership.role,
    memberCount: members.length,
    members: members.map((m) => ({
      profileId: m.profileId,
      displayName: m.displayName,
      role: m.role,
      managed: m.userId === null,
      managedByMe: mine.has(m.profileId),
      isMe: m.profileId === me.id,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
  return c.json(body);
});

/** Name/Beschreibung ändern (Admin) */
groupRoutes.patch("/:groupId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const groupId = c.req.param("groupId");
  await requireAdmin(groupId, me.id);
  const input = await parseJson(c, groupInputSchema);
  await db
    .update(group)
    .set({ name: input.name, description: input.description || null })
    .where(eq(group.id, groupId));
  return c.json({ ok: true });
});

/** Gruppe löschen (Admin). Wünsche bleiben erhalten, nur die Gruppe verschwindet. */
groupRoutes.delete("/:groupId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const groupId = c.req.param("groupId");
  await requireAdmin(groupId, me.id);
  await db.delete(group).where(eq(group.id, groupId));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------

async function adminCount(groupId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.role, "admin")));
  return row?.n ?? 0;
}

/** Rolle ändern (Admin) */
groupRoutes.patch("/:groupId/members/:profileId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const { groupId, profileId } = c.req.param();
  await requireAdmin(groupId, me.id);
  const target = await requireMember(groupId, profileId);
  const { role } = await parseJson(c, updateMemberSchema);

  if (role === "admin") {
    const [p] = await db.select({ userId: profile.userId }).from(profile).where(eq(profile.id, profileId));
    if (!p?.userId) throw badRequest("Kinderprofile ohne eigenes Konto können keine Admins sein");
  }
  if (target.role === "admin" && role === "member" && (await adminCount(groupId)) <= 1) {
    throw badRequest("Die Gruppe braucht mindestens einen Admin");
  }
  await db
    .update(groupMember)
    .set({ role })
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.profileId, profileId)));
  return c.json({ ok: true });
});

/** Mitglied entfernen (Admin) oder selbst austreten */
groupRoutes.delete("/:groupId/members/:profileId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const { groupId, profileId } = c.req.param();
  const self = profileId === me.id;
  if (self) await requireMember(groupId, me.id);
  else await requireAdmin(groupId, me.id);
  const target = await requireMember(groupId, profileId);

  // Nur Mitglieder mit eigenem Konto zählen (Kinderprofile können keine Gruppe führen)
  const [{ n: adults } = { n: 0 }] = await db
    .select({ n: count() })
    .from(groupMember)
    .innerJoin(profile, eq(profile.id, groupMember.profileId))
    .where(and(eq(groupMember.groupId, groupId), sql`${profile.userId} IS NOT NULL`));

  if (adults <= 1 && target.role === "admin") {
    // Letztes Mitglied mit Konto geht: Gruppe auflösen
    await db.delete(group).where(eq(group.id, groupId));
    return c.json({ ok: true, groupDeleted: true });
  }
  if (target.role === "admin" && (await adminCount(groupId)) <= 1) {
    throw badRequest(
      self
        ? "Du bist der einzige Admin. Ernenne zuerst jemand anderen zum Admin, bevor du die Gruppe verlässt."
        : "Die Gruppe braucht mindestens einen Admin",
    );
  }
  await db.delete(groupMember).where(and(eq(groupMember.groupId, groupId), eq(groupMember.profileId, profileId)));
  return c.json({ ok: true, groupDeleted: false });
});

// ---------------------------------------------------------------------------
// Einladungen
// ---------------------------------------------------------------------------

/** Aktive Einladungen (Admin) */
groupRoutes.get("/:groupId/invites", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const groupId = c.req.param("groupId");
  await requireAdmin(groupId, me.id);
  const rows = await db
    .select({ invite: groupInvite, createdByName: user.name })
    .from(groupInvite)
    .innerJoin(user, eq(user.id, groupInvite.createdByUserId))
    .where(
      and(
        eq(groupInvite.groupId, groupId),
        isNull(groupInvite.revokedAt),
        gt(groupInvite.expiresAt, new Date()),
        or(isNull(groupInvite.maxUses), sql`${groupInvite.useCount} < ${groupInvite.maxUses}`),
      ),
    )
    .orderBy(desc(groupInvite.createdAt));
  const body: InviteDto[] = rows.map(({ invite, createdByName }) => ({
    id: invite.id,
    url: inviteUrl(invite.token),
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    createdByName,
  }));
  return c.json(body);
});

/** Einladung erstellen, optional per Mail verschicken (Admin) */
groupRoutes.post("/:groupId/invites", async (c) => {
  const u = requireUser(c);
  const me = await getOwnProfile(u);
  const groupId = c.req.param("groupId");
  await requireAdmin(groupId, me.id);
  const input = await parseJson(c, createInviteSchema);
  const [g] = await db.select({ name: group.name }).from(group).where(eq(group.id, groupId));

  const email = input.email?.toLowerCase() ?? null;
  const [invite] = await db
    .insert(groupInvite)
    .values({
      groupId,
      email,
      token: newToken(),
      createdByUserId: u.id,
      expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
      // Mail-Einladungen sind für genau eine Person gedacht
      maxUses: email ? 1 : (input.maxUses ?? null),
    })
    .returning();

  const url = inviteUrl(invite!.token);
  if (email) {
    await sendMail(
      linkMail(
        email,
        `${u.name} lädt dich zur Gruppe „${g!.name}“ ein`,
        `${u.name} hat dich bei „${APP_NAME}“ in die Gruppe „${g!.name}“ eingeladen. Dort könnt ihr eure Wunschlisten teilen und Geschenke reservieren.`,
        "Einladung annehmen",
        url,
      ),
    );
  }

  const body: InviteDto = {
    id: invite!.id,
    url,
    email: invite!.email,
    expiresAt: invite!.expiresAt.toISOString(),
    maxUses: invite!.maxUses,
    useCount: 0,
    createdByName: u.name,
  };
  return c.json(body, 201);
});

/** Einladung zurückziehen (Admin) */
groupRoutes.delete("/:groupId/invites/:inviteId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const { groupId, inviteId } = c.req.param();
  await requireAdmin(groupId, me.id);
  await db
    .update(groupInvite)
    .set({ revokedAt: new Date() })
    .where(and(eq(groupInvite.id, inviteId), eq(groupInvite.groupId, groupId)));
  return c.json({ ok: true });
});
