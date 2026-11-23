/**
 * Was passiert mit laufenden Events, wenn jemand neu in eine Gruppe kommt?
 *
 *  - "Alle beschenken alle", bei dem bisher die ganze Gruppe mitmacht → automatisch hinzufügen
 *  - Wichteln oder Event mit Auswahl → Organisatoren (Ersteller + Gruppen-Admins) benachrichtigen,
 *    mit Button direkt zur Event-Ansicht
 *
 * "Laufend" = ohne Datum oder Datum heute bzw. in der Zukunft.
 */
import { and, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "../db/index.ts";
import { event, eventParticipant, group, groupMember, profile } from "../db/schema.ts";
import { notify } from "./notifications.ts";

export async function handleNewGroupMember(groupId: string, newProfileId: string, actorUserId?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const events = await db
    .select()
    .from(event)
    .where(and(eq(event.groupId, groupId), ne(event.status, "closed"), or(isNull(event.date), gte(event.date, today))));
  if (events.length === 0) return { added: [] as string[], notified: [] as string[] };

  const [g] = await db.select({ name: group.name }).from(group).where(eq(group.id, groupId));
  const [p] = await db.select({ name: profile.displayName, userId: profile.userId }).from(profile).where(eq(profile.id, newProfileId));
  const members = await db.select().from(groupMember).where(eq(groupMember.groupId, groupId));
  const others = members.filter((m) => m.profileId !== newProfileId).map((m) => m.profileId);
  const admins = members.filter((m) => m.role === "admin").map((m) => m.profileId);
  const adminUsers = admins.length
    ? (await db.select({ userId: profile.userId }).from(profile).where(inArray(profile.id, admins))).map((a) => a.userId!).filter(Boolean)
    : [];

  const added: string[] = [];
  const notified: string[] = [];
  for (const e of events) {
    const participants = new Set(
      (await db.select({ id: eventParticipant.profileId }).from(eventParticipant).where(eq(eventParticipant.eventId, e.id))).map((r) => r.id),
    );
    if (participants.has(newProfileId)) continue;
    const wholeGroup = others.every((id) => participants.has(id));

    if (e.type === "standard" && wholeGroup) {
      await db.insert(eventParticipant).values({ eventId: e.id, profileId: newProfileId }).onConflictDoNothing();
      added.push(e.id);
      continue;
    }

    // Organisatoren benachrichtigen (außer der Person, die die Änderung selbst ausgelöst hat)
    const recipients = [...new Set([e.createdByUserId, ...adminUsers].filter((x): x is string => !!x))].filter(
      (id) => id !== actorUserId && id !== p?.userId,
    );
    if (recipients.length === 0) continue;
    const name = p?.name ?? "Jemand";
    const why =
      e.type === "secret_santa"
        ? e.status === "drawn"
          ? `Beim Wichteln „${e.name}“ ist bereits ausgelost. Um ${name} dazuzunehmen, musst du die Auslosung zurücksetzen, ${name} hinzufügen und neu auslosen.`
          : `${name} nimmt beim Wichteln „${e.name}“ noch nicht teil. Du kannst ${name} in der Event-Ansicht unter „Wer macht mit?“ hinzufügen.`
        : `${name} nimmt am Event „${e.name}“ noch nicht teil, weil dort nur ausgewählte Personen mitmachen. Du kannst ${name} in der Event-Ansicht hinzufügen.`;
    await notify(recipients, {
      title: `Neu in „${g?.name ?? "deiner Gruppe"}“: ${name}`,
      body: `${name} ist der Gruppe „${g?.name ?? ""}“ beigetreten. ${why}`,
      linkPath: `/events/${e.id}`,
      linkLabel: "Zum Event",
    });
    notified.push(e.id);
  }
  return { added, notified };
}
