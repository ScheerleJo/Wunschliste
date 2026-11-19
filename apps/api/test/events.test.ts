import { beforeEach, describe, expect, it } from "vitest";
import { call, createUser, resetDb, type TestUser } from "./helpers.ts";

let josia: TestUser, frau: TestUser, oma: TestUser, opa: TestUser, fremd: TestUser;
let g: string;
const P: Record<string, string> = {};

async function join(admin: TestUser, groupId: string, u: TestUser) {
  const inv = await call(admin, "POST", `/groups/${groupId}/invites`, {});
  await call(u, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
}
const newEvent = async (body: object = {}) =>
  (await call(josia, "POST", `/groups/${g}/events`, { type: "secret_santa", name: "Wichteln 2026", budgetMaxCents: 3000, ...body })).body
    .id as string;
const detail = (u: TestUser, id: string) => call(u, "GET", `/events/${id}`);

beforeEach(async () => {
  await resetDb();
  josia = await createUser("Josia");
  frau = await createUser("Frau");
  oma = await createUser("Oma");
  opa = await createUser("Opa");
  fremd = await createUser("Fremd");
  g = (await call(josia, "POST", "/groups", { name: "Familie" })).body.id;
  for (const u of [frau, oma, opa]) await join(josia, g, u);
  for (const [n, u] of Object.entries({ josia, frau, oma, opa })) P[n] = (await call(u, "GET", "/me")).body.profile.id;
});

describe("Haushalte", () => {
  it("nur Admins legen sie an; niemand in zwei Haushalten", async () => {
    expect((await call(frau, "POST", `/groups/${g}/households`, { name: "X", profileIds: [P.josia, P.frau] })).status).toBe(403);
    expect((await call(josia, "POST", `/groups/${g}/households`, { name: "Josia & Frau", profileIds: [P.josia, P.frau] })).status).toBe(201);
    expect((await call(josia, "POST", `/groups/${g}/households`, { name: "Doppelt", profileIds: [P.frau, P.oma] })).status).toBe(400);
    const list = (await call(oma, "GET", `/groups/${g}/households`)).body;
    expect(list[0].members.map((m: any) => m.displayName)).toEqual(["Frau", "Josia"]);
  });
});

describe("Wichteln", () => {
  it("Event anlegen: alle Gruppenmitglieder nehmen teil, Fremde sehen nichts", async () => {
    const id = await newEvent();
    expect((await detail(oma, id)).body).toMatchObject({ participantCount: 4, participating: true, canManage: false, status: "draft" });
    expect((await detail(fremd, id)).status).toBe(404);
    expect((await call(oma, "GET", "/events")).body.map((e: any) => e.name)).toEqual(["Wichteln 2026"]);
  });

  it("Auslosung: jeder sieht nur seine eigene Zuordnung, auch der Organisator", async () => {
    const id = await newEvent();
    expect((await call(oma, "POST", `/events/${id}/draw`)).status).toBe(403);
    expect((await call(josia, "POST", `/events/${id}/draw`)).body).toEqual({ ok: true, previousYearIgnored: false });

    const receivers = new Set<string>();
    for (const [name, u] of Object.entries({ josia, frau, oma, opa })) {
      const d = (await detail(u, id)).body;
      expect(d.myAssignments).toHaveLength(1);
      expect(d.myAssignments[0].giver.profileId).toBe(P[name]);
      expect(d.myAssignments[0].receiver.profileId).not.toBe(P[name]);
      receivers.add(d.myAssignments[0].receiver.profileId);
    }
    expect(receivers.size).toBe(4);
  });

  it("Haushalte und von Hand gesetzte Ausschlüsse werden beachtet", async () => {
    await call(josia, "POST", `/groups/${g}/households`, { name: "Josia & Frau", profileIds: [P.josia, P.frau] });
    const id = await newEvent();
    await call(josia, "PUT", `/events/${id}/exclusions`, { pairs: [{ a: P.oma, b: P.opa }] });
    for (let i = 0; i < 10; i++) {
      await call(josia, "POST", `/events/${id}/draw`);
      const mine = (await detail(josia, id)).body.myAssignments[0].receiver.profileId;
      const omas = (await detail(oma, id)).body.myAssignments[0].receiver.profileId;
      expect(mine).not.toBe(P.frau);
      expect(omas).not.toBe(P.opa);
    }
  });

  it("unmögliche Ausschlüsse ergeben eine verständliche Fehlermeldung", async () => {
    await call(josia, "POST", `/groups/${g}/households`, { name: "Alle außer Opa", profileIds: [P.josia, P.frau, P.oma] });
    const id = await newEvent();
    const res = await call(josia, "POST", `/events/${id}/draw`);
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("Keine gültige Auslosung");
  });

  it("Paarungen des letzten Wichtelns werden nicht wiederholt und bleiben geheim", async () => {
    // 3 Personen: es gibt nur zwei mögliche Kreise. Nach letztem Jahr bleibt genau einer übrig.
    const id1 = await newEvent({ name: "2025" });
    await call(josia, "PUT", `/events/${id1}/participants`, { profileIds: [P.josia, P.oma, P.opa] });
    await call(josia, "POST", `/events/${id1}/draw`);
    const last = (await detail(josia, id1)).body.myAssignments[0].receiver.profileId;

    const id2 = await newEvent({ name: "2026" });
    await call(josia, "PUT", `/events/${id2}/participants`, { profileIds: [P.josia, P.oma, P.opa] });
    for (let i = 0; i < 5; i++) {
      expect((await call(josia, "POST", `/events/${id2}/draw`)).body.previousYearIgnored).toBe(false);
      expect((await detail(josia, id2)).body.myAssignments[0].receiver.profileId).not.toBe(last);
    }
    // Die Vorjahres-Ausschlüsse tauchen nirgends auf
    expect((await detail(josia, id2)).body.manualExclusions).toEqual([]);
  });

  it("Vorjahr wird ignoriert, wenn es sonst keine Lösung gibt", async () => {
    await call(josia, "POST", `/groups/${g}/households`, { name: "Josia & Frau", profileIds: [P.josia, P.frau] });
    await call(josia, "POST", `/groups/${g}/households`, { name: "Oma & Opa", profileIds: [P.oma, P.opa] });
    const id1 = await newEvent({ name: "2025" });
    await call(josia, "POST", `/events/${id1}/draw`);
    // 2 Paare: jedes Jahr gibt es nur 4 mögliche Zuordnungen; mit Vorjahr kann es eng werden
    const id2 = await newEvent({ name: "2026" });
    const res = await call(josia, "POST", `/events/${id2}/draw`);
    expect(res.status).toBe(200);
  });

  it("Teilnehmende/Ausschlüsse nur vor der Auslosung änderbar; Zurücksetzen möglich", async () => {
    const id = await newEvent();
    await call(josia, "POST", `/events/${id}/draw`);
    expect((await call(josia, "PUT", `/events/${id}/participants`, { profileIds: [P.josia, P.oma, P.opa] })).status).toBe(400);
    await call(josia, "POST", `/events/${id}/reset`);
    expect((await detail(oma, id)).body).toMatchObject({ status: "draft", myAssignments: [] });
    expect((await call(josia, "PUT", `/events/${id}/participants`, { profileIds: [P.josia, P.oma, P.opa] })).status).toBe(200);
    expect((await detail(frau, id)).body.participating).toBe(false);
  });

  it("Notfall-Einsicht: nur Organisator, mit Grund, für alle sichtbar protokolliert", async () => {
    const id = await newEvent();
    await call(josia, "POST", `/events/${id}/draw`);
    expect((await call(oma, "POST", `/events/${id}/reveal`, { reason: "Neugier" })).status).toBe(403);
    expect((await call(josia, "POST", `/events/${id}/reveal`, {})).status).toBe(400);
    const res = await call(josia, "POST", `/events/${id}/reveal`, { reason: "Opa hat seinen Zettel verloren" });
    expect(res.body).toHaveLength(4);
    const log = (await detail(oma, id)).body.reveals;
    expect(log).toEqual([expect.objectContaining({ byName: "Josia", reason: "Opa hat seinen Zettel verloren" })]);
  });

  it("Gruppen-Admins können verwalten; Eltern sehen die Zuordnung ihrer Kinder", async () => {
    const kind = (await call(frau, "POST", "/children", { displayName: "Emil" })).body.id;
    await call(frau, "POST", `/children/${kind}/groups`, { groupId: g });
    const id = (await call(oma, "POST", `/groups/${g}/events`, { type: "secret_santa", name: "Omas Wichteln" })).body.id;
    expect((await detail(josia, id)).body.canManage).toBe(true); // Admin
    expect((await detail(frau, id)).body.canManage).toBe(false);
    await call(oma, "POST", `/events/${id}/draw`);
    const frauSieht = (await detail(frau, id)).body.myAssignments.map((a: any) => a.giver.displayName).sort();
    expect(frauSieht).toEqual(["Emil", "Frau"]);
  });

  it("Standard-Event (alle beschenken alle) wird nicht ausgelost", async () => {
    const id = await newEvent({ type: "standard", name: "Weihnachten" });
    expect((await call(josia, "POST", `/events/${id}/draw`)).status).toBe(400);
    expect((await detail(oma, id)).body).toMatchObject({ type: "standard", budgetMaxCents: 3000, myAssignments: [] });
  });
});
