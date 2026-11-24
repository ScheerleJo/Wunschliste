import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import {
  eventInputSchema,
  exclusionPairsSchema,
  householdInputSchema,
  type DrawResultDto,
  type EventAssignmentDto,
  type EventDetailDto,
  type EventSummaryDto,
  type HouseholdDto,
} from "@wunschliste/shared";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  event,
  eventAssignment,
  eventExclusion,
  eventParticipant,
  eventRevealLog,
  group,
  groupMember,
  household,
  householdMember,
  profile,
  profileGuardian,
  user,
} from "../db/schema.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";
import { badRequest, forbidden, notFound, parseJson } from "../lib/http.ts";
import { draw, type Pair } from "../services/draw.ts";
import { getMembership, requireAdmin, requireMember } from "../services/groups.ts";
import { getOwnProfile } from "../services/profiles.ts";
import type { AuthUser } from "../auth.ts";

export const eventRoutes = new Hono<AppEnv>();

type EventRow = typeof event.$inferSelect;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/** Profile, für die der Benutzer handelt: das eigene und die verwalteten Kinderprofile */
async function myProfileIds(u: AuthUser) {
  const own = await getOwnProfile(u);
  const kids = await db
    .select({ id: profileGuardian.profileId })
    .from(profileGuardian)
    .where(eq(profileGuardian.guardianUserId, u.id));
  return { ownId: own.id, all: [own.id, ...kids.map((k) => k.id)] };
}

/** Event laden; nur für Mitglieder der Gruppe sichtbar (sonst 404) */
async function loadEvent(u: AuthUser, eventId: string) {
  const [row] = await db
    .select({ e: event, groupName: group.name })
    .from(event)
    .innerJoin(group, eq(group.id, event.groupId))
    .where(eq(event.id, eventId));
  if (!row) throw notFound("Event nicht gefunden");
  const me = await getOwnProfile(u);
  const membership = await getMembership(row.e.groupId, me.id);
  if (!membership) throw notFound("Event nicht gefunden");
  const canManage = row.e.createdByUserId === u.id || membership.role === "admin";
  return { ...row, canManage };
}

async function requireManage(u: AuthUser, eventId: string) {
  const ev = await loadEvent(u, eventId);
  if (!ev.canManage) throw forbidden("Nur der Organisator oder Gruppen-Admins dürfen das");
  return ev;
}

async function participantIds(eventId: string) {
  return (await db.select({ id: eventParticipant.profileId }).from(eventParticipant).where(eq(eventParticipant.eventId, eventId))).map(
    (r) => r.id,
  );
}

async function summaries(rows: { e: EventRow; groupName: string }[], mine: string[]): Promise<EventSummaryDto[]> {
  const ids = rows.map((r) => r.e.id);
  const parts = ids.length ? await db.select().from(eventParticipant).where(inArray(eventParticipant.eventId, ids)) : [];
  return rows.map(({ e, groupName }) => {
    const p = parts.filter((x) => x.eventId === e.id);
    return {
      id: e.id,
      groupId: e.groupId,
      groupName,
      type: e.type,
      name: e.name,
      date: e.date,
      budgetMinCents: e.budgetMinCents,
      budgetMaxCents: e.budgetMaxCents,
      status: e.status,
      participantCount: p.length,
      participating: p.some((x) => mine.includes(x.profileId)),
    };
  });
}

/**
 * Ausschlüsse für die Auslosung:
 *  - von Hand gesetzte (beidseitig gespeichert)
 *  - Haushalte der Gruppe (alle Mitglieder eines Haushalts untereinander)
 *  - optional: Paarungen des letzten Wichtelns derselben Gruppe (einseitig)
 */
async function collectExclusions(e: EventRow, includePrevious: boolean): Promise<Pair[]> {
  const manual = await db.select().from(eventExclusion).where(eq(eventExclusion.eventId, e.id));
  const pairs: Pair[] = manual.map((m) => ({ giver: m.giverProfileId, receiver: m.receiverProfileId }));

  const hh = await db
    .select({ householdId: householdMember.householdId, profileId: householdMember.profileId })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(eq(household.groupId, e.groupId));
  const byHousehold = new Map<string, string[]>();
  for (const m of hh) byHousehold.set(m.householdId, [...(byHousehold.get(m.householdId) ?? []), m.profileId]);
  for (const members of byHousehold.values()) {
    for (const a of members) for (const b of members) if (a !== b) pairs.push({ giver: a, receiver: b });
  }

  if (includePrevious) {
    const [prev] = await db
      .select({ id: event.id })
      .from(event)
      .where(
        and(
          eq(event.groupId, e.groupId),
          eq(event.type, "secret_santa"),
          ne(event.id, e.id),
          isNotNull(event.drawnAt),
          lt(event.createdAt, e.createdAt),
        ),
      )
      .orderBy(desc(event.createdAt))
      .limit(1);
    if (prev) {
      const last = await db.select().from(eventAssignment).where(eq(eventAssignment.eventId, prev.id));
      pairs.push(...last.map((a) => ({ giver: a.giverProfileId, receiver: a.receiverProfileId })));
    }
  }
  return pairs;
}

async function assignmentsWithNames(eventId: string, giverIds?: string[]): Promise<EventAssignmentDto[]> {
  const rows = await db
    .select({ a: eventAssignment })
    .from(eventAssignment)
    .where(
      giverIds
        ? and(eq(eventAssignment.eventId, eventId), inArray(eventAssignment.giverProfileId, giverIds.length ? giverIds : ["-"]))
        : eq(eventAssignment.eventId, eventId),
    );
  const ids = [...new Set(rows.flatMap((r) => [r.a.giverProfileId, r.a.receiverProfileId]))];
  const names = ids.length ? await db.select({ id: profile.id, name: profile.displayName }).from(profile).where(inArray(profile.id, ids)) : [];
  const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? "?";
  return rows
    .map(({ a }) => ({
      giver: { profileId: a.giverProfileId, displayName: nameOf(a.giverProfileId) },
      receiver: { profileId: a.receiverProfileId, displayName: nameOf(a.receiverProfileId) },
    }))
    .sort((x, y) => x.giver.displayName.localeCompare(y.giver.displayName, "de"));
}

// ---------------------------------------------------------------------------
// Haushalte (pro Gruppe; Vorlage für Wichtel-Ausschlüsse)
// ---------------------------------------------------------------------------

async function householdsOf(groupId: string): Promise<HouseholdDto[]> {
  const hs = await db.select().from(household).where(eq(household.groupId, groupId)).orderBy(asc(household.name));
  const members = hs.length
    ? await db
        .select({ householdId: householdMember.householdId, profileId: profile.id, displayName: profile.displayName })
        .from(householdMember)
        .innerJoin(profile, eq(profile.id, householdMember.profileId))
        .where(
          inArray(
            householdMember.householdId,
            hs.map((h) => h.id),
          ),
        )
        .orderBy(asc(profile.displayName))
    : [];
  return hs.map((h) => ({
    id: h.id,
    name: h.name,
    members: members.filter((m) => m.householdId === h.id).map(({ profileId, displayName }) => ({ profileId, displayName })),
  }));
}

/** Prüft: alle Profile sind Gruppenmitglieder und in keinem anderen Haushalt dieser Gruppe */
async function validateHousehold(groupId: string, profileIds: string[], exceptHouseholdId?: string) {
  const ids = [...new Set(profileIds)];
  const members = await db
    .select({ id: groupMember.profileId })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), inArray(groupMember.profileId, ids)));
  if (members.length !== ids.length) throw badRequest("Alle Personen müssen Mitglied der Gruppe sein");
  const taken = await db
    .select({ profileId: householdMember.profileId, name: household.name })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(
      and(
        eq(household.groupId, groupId),
        inArray(householdMember.profileId, ids),
        exceptHouseholdId ? ne(household.id, exceptHouseholdId) : undefined,
      ),
    );
  if (taken.length > 0) throw badRequest(`Jemand ist bereits im Haushalt „${taken[0]!.name}“`);
  return ids;
}

eventRoutes.get("/groups/:groupId/households", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  await requireMember(c.req.param("groupId"), me.id);
  return c.json(await householdsOf(c.req.param("groupId")));
});

eventRoutes.post("/groups/:groupId/households", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const groupId = c.req.param("groupId");
  await requireAdmin(groupId, me.id);
  const input = await parseJson(c, householdInputSchema);
  const ids = await validateHousehold(groupId, input.profileIds);
  const h = await db.transaction(async (tx) => {
    const [h] = await tx.insert(household).values({ groupId, name: input.name }).returning();
    await tx.insert(householdMember).values(ids.map((profileId) => ({ householdId: h!.id, profileId })));
    return h!;
  });
  return c.json({ id: h.id }, 201);
});

async function loadHousehold(householdId: string) {
  const [h] = await db.select().from(household).where(eq(household.id, householdId));
  if (!h) throw notFound("Haushalt nicht gefunden");
  return h;
}

eventRoutes.put("/households/:householdId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const h = await loadHousehold(c.req.param("householdId"));
  await requireAdmin(h.groupId, me.id);
  const input = await parseJson(c, householdInputSchema);
  const ids = await validateHousehold(h.groupId, input.profileIds, h.id);
  await db.transaction(async (tx) => {
    await tx.update(household).set({ name: input.name }).where(eq(household.id, h.id));
    await tx.delete(householdMember).where(eq(householdMember.householdId, h.id));
    await tx.insert(householdMember).values(ids.map((profileId) => ({ householdId: h.id, profileId })));
  });
  return c.json({ ok: true });
});

eventRoutes.delete("/households/:householdId", async (c) => {
  const me = await getOwnProfile(requireUser(c));
  const h = await loadHousehold(c.req.param("householdId"));
  await requireAdmin(h.groupId, me.id);
  await db.delete(household).where(eq(household.id, h.id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Alle Events in meinen Gruppen: kommende zuerst (nach Datum), dann vergangene */
eventRoutes.get("/events", async (c) => {
  const u = requireUser(c);
  const { ownId, all } = await myProfileIds(u);
  const rows = await db
    .select({ e: event, groupName: group.name })
    .from(event)
    .innerJoin(group, eq(group.id, event.groupId))
    .innerJoin(groupMember, and(eq(groupMember.groupId, event.groupId), eq(groupMember.profileId, ownId)))
    .orderBy(asc(event.date), desc(event.createdAt));
  const today = new Date().toISOString().slice(0, 10);
  const list = await summaries(rows, all);
  const upcoming = list.filter((e) => !e.date || e.date >= today);
  const past = list.filter((e) => e.date && e.date < today).reverse();
  return c.json([...upcoming, ...past]);
});

/** Neues Event; Teilnehmende sind zunächst alle Gruppenmitglieder */
eventRoutes.post("/groups/:groupId/events", async (c) => {
  const u = requireUser(c);
  const me = await getOwnProfile(u);
  const groupId = c.req.param("groupId");
  await requireMember(groupId, me.id);
  const input = await parseJson(c, eventInputSchema);
  const created = await db.transaction(async (tx) => {
    const [e] = await tx
      .insert(event)
      .values({
        groupId,
        type: input.type,
        name: input.name,
        description: input.description || null,
        date: input.date || null,
        budgetMinCents: input.budgetMinCents ?? null,
        budgetMaxCents: input.budgetMaxCents ?? null,
        createdByUserId: u.id,
      })
      .returning();
    const members = await tx.select({ id: groupMember.profileId }).from(groupMember).where(eq(groupMember.groupId, groupId));
    if (members.length) await tx.insert(eventParticipant).values(members.map((m) => ({ eventId: e!.id, profileId: m.id })));
    return e!;
  });
  return c.json({ id: created.id }, 201);
});

eventRoutes.get("/events/:eventId", async (c) => {
  const u = requireUser(c);
  const ev = await loadEvent(u, c.req.param("eventId"));
  const { all } = await myProfileIds(u);
  const e = ev.e;

  const [participants, creator, reveals, manual] = await Promise.all([
    db
      .select({ profileId: profile.id, displayName: profile.displayName, userId: profile.userId })
      .from(eventParticipant)
      .innerJoin(profile, eq(profile.id, eventParticipant.profileId))
      .where(eq(eventParticipant.eventId, e.id))
      .orderBy(asc(profile.displayName)),
    e.createdByUserId ? db.select({ name: user.name }).from(user).where(eq(user.id, e.createdByUserId)) : Promise.resolve([]),
    db
      .select({ at: eventRevealLog.createdAt, byName: user.name, reason: eventRevealLog.reason })
      .from(eventRevealLog)
      .leftJoin(user, eq(user.id, eventRevealLog.revealedByUserId))
      .where(eq(eventRevealLog.eventId, e.id))
      .orderBy(asc(eventRevealLog.createdAt)),
    ev.canManage
      ? db
          .select()
          .from(eventExclusion)
          .where(and(eq(eventExclusion.eventId, e.id), eq(eventExclusion.source, "manual")))
      : Promise.resolve([]),
  ]);

  const [summary] = await summaries([{ e, groupName: ev.groupName }], all);
  const body: EventDetailDto = {
    ...summary!,
    description: e.description,
    createdByName: creator[0]?.name ?? null,
    canManage: ev.canManage,
    participants: participants.map((p) => ({ profileId: p.profileId, displayName: p.displayName, managed: p.userId === null })),
    // Jede Person sieht nur ihre eigene Zuordnung (und die ihrer Kinder), auch der Organisator.
    myAssignments: e.type === "secret_santa" ? await assignmentsWithNames(e.id, all) : [],
    manualExclusions: manual.filter((m) => m.giverProfileId < m.receiverProfileId).map((m) => ({ a: m.giverProfileId, b: m.receiverProfileId })),
    reveals: reveals.map((r) => ({ at: r.at.toISOString(), byName: r.byName, reason: r.reason })),
    drawnAt: e.drawnAt?.toISOString() ?? null,
  };
  return c.json(body);
});

/**
 * Art wechseln (Wichteln ja/nein). Geht jederzeit; eine bestehende Auslosung wird dabei verworfen,
 * damit beim späteren erneuten Wichteln frisch gelost wird.
 */
async function changeType(eventRow: EventRow, type: EventRow["type"]) {
  if (type === eventRow.type) return;
  await db.transaction(async (tx) => {
    await tx.delete(eventAssignment).where(eq(eventAssignment.eventId, eventRow.id));
    await tx.update(event).set({ type, status: "draft", drawnAt: null }).where(eq(event.id, eventRow.id));
  });
}

eventRoutes.patch("/events/:eventId", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  const input = await parseJson(c, eventInputSchema);
  await changeType(ev.e, input.type);
  await db
    .update(event)
    .set({
      name: input.name,
      description: input.description || null,
      date: input.date || null,
      budgetMinCents: input.budgetMinCents ?? null,
      budgetMaxCents: input.budgetMaxCents ?? null,
    })
    .where(eq(event.id, ev.e.id));
  return c.json({ ok: true });
});

/** Nur die Art umschalten: wird gewichtelt oder frei geschenkt? */
eventRoutes.put("/events/:eventId/type", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  const { type } = await parseJson(c, z.object({ type: z.enum(["secret_santa", "standard"]) }));
  await changeType(ev.e, type);
  return c.json({ ok: true });
});

eventRoutes.delete("/events/:eventId", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  await db.delete(event).where(eq(event.id, ev.e.id));
  return c.json({ ok: true });
});

/** Teilnehmende festlegen (nur vor der Auslosung) */
eventRoutes.put("/events/:eventId/participants", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  if (ev.e.status !== "draft") throw badRequest("Nach der Auslosung erst zurücksetzen, um Teilnehmende zu ändern");
  const { profileIds } = await parseJson(c, z.object({ profileIds: z.array(z.string()).max(500) }));
  const ids = [...new Set(profileIds)];
  const valid = ids.length
    ? await db
        .select({ id: groupMember.profileId })
        .from(groupMember)
        .where(and(eq(groupMember.groupId, ev.e.groupId), inArray(groupMember.profileId, ids)))
    : [];
  if (valid.length !== ids.length) throw badRequest("Alle Teilnehmenden müssen Mitglied der Gruppe sein");
  await db.transaction(async (tx) => {
    await tx.delete(eventParticipant).where(eq(eventParticipant.eventId, ev.e.id));
    if (ids.length) await tx.insert(eventParticipant).values(ids.map((profileId) => ({ eventId: ev.e.id, profileId })));
  });
  return c.json({ ok: true });
});

/** Von Hand gesetzte, beidseitige Ausschlüsse ersetzen (nur vor der Auslosung) */
eventRoutes.put("/events/:eventId/exclusions", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  if (ev.e.status !== "draft") throw badRequest("Nach der Auslosung erst zurücksetzen, um Ausschlüsse zu ändern");
  const { pairs } = await parseJson(c, exclusionPairsSchema);
  const parts = new Set(await participantIds(ev.e.id));
  const rows = pairs
    .filter((p) => p.a !== p.b && parts.has(p.a) && parts.has(p.b))
    .flatMap((p) => [
      { eventId: ev.e.id, giverProfileId: p.a, receiverProfileId: p.b, source: "manual" as const },
      { eventId: ev.e.id, giverProfileId: p.b, receiverProfileId: p.a, source: "manual" as const },
    ]);
  await db.transaction(async (tx) => {
    await tx.delete(eventExclusion).where(and(eq(eventExclusion.eventId, ev.e.id), eq(eventExclusion.source, "manual")));
    if (rows.length) await tx.insert(eventExclusion).values(rows).onConflictDoNothing();
  });
  return c.json({ ok: true });
});

/** Auslosen (oder neu auslosen) */
eventRoutes.post("/events/:eventId/draw", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  if (ev.e.type !== "secret_santa") throw badRequest("Nur Wichtel-Events werden ausgelost");
  const parts = await participantIds(ev.e.id);
  if (parts.length < 3) throw badRequest("Zum Wichteln braucht es mindestens drei Teilnehmende");

  let previousYearIgnored = false;
  let result = draw(parts, await collectExclusions(ev.e, true));
  if (!result) {
    result = draw(parts, await collectExclusions(ev.e, false));
    previousYearIgnored = result !== null;
  }
  if (!result) {
    throw new HTTPException(422, {
      message: "Keine gültige Auslosung möglich: Es gibt zu viele Ausschlüsse (Haushalte bzw. von Hand gesetzte Paare). Bitte lockere sie etwas.",
    });
  }

  await db.transaction(async (tx) => {
    await tx.delete(eventAssignment).where(eq(eventAssignment.eventId, ev.e.id));
    await tx
      .insert(eventAssignment)
      .values(result.map((p) => ({ eventId: ev.e.id, giverProfileId: p.giver, receiverProfileId: p.receiver })));
    await tx.update(event).set({ status: "drawn", drawnAt: new Date() }).where(eq(event.id, ev.e.id));
  });
  return c.json({ ok: true, previousYearIgnored } satisfies DrawResultDto);
});

/** Auslosung verwerfen, um Teilnehmende oder Ausschlüsse zu ändern */
eventRoutes.post("/events/:eventId/reset", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  await db.transaction(async (tx) => {
    await tx.delete(eventAssignment).where(eq(eventAssignment.eventId, ev.e.id));
    await tx.update(event).set({ status: "draft", drawnAt: null }).where(eq(event.id, ev.e.id));
  });
  return c.json({ ok: true });
});

/**
 * Notfall-Einsicht: Organisatoren können die komplette Zuordnung aufdecken.
 * Jede Einsicht wird protokolliert und ist für alle Teilnehmenden sichtbar.
 */
eventRoutes.post("/events/:eventId/reveal", async (c) => {
  const u = requireUser(c);
  const ev = await requireManage(u, c.req.param("eventId"));
  if (ev.e.status === "draft") throw badRequest("Es wurde noch nicht ausgelost");
  const { reason } = await parseJson(c, z.object({ reason: z.string().trim().min(3, "Bitte gib einen Grund an").max(300) }));
  await db.insert(eventRevealLog).values({ eventId: ev.e.id, revealedByUserId: u.id, reason });
  return c.json(await assignmentsWithNames(ev.e.id));
});

