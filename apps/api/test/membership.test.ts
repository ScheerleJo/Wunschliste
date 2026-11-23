import { beforeEach, describe, expect, it } from "vitest";
import { call, createUser, resetDb, type TestUser } from "./helpers.ts";

let josia: TestUser, frau: TestUser, oma: TestUser, opa: TestUser;
let g: string;
const P: Record<string, string> = {};

async function invite(u: TestUser) {
  const inv = await call(josia, "POST", `/groups/${g}/invites`, {});
  await call(u, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
}
const participants = async (id: string) => (await call(josia, "GET", `/events/${id}`)).body.participants.map((p: any) => p.displayName).sort();
const notes = async (u: TestUser) => (await call(u, "GET", "/notifications")).body;
const newEvent = async (by: TestUser, body: object) => (await call(by, "POST", `/groups/${g}/events`, { name: "Event", ...body })).body.id as string;

beforeEach(async () => {
  await resetDb();
  josia = await createUser("Josia");
  frau = await createUser("Frau");
  oma = await createUser("Oma");
  opa = await createUser("Opa");
  g = (await call(josia, "POST", "/groups", { name: "Familie" })).body.id;
  await invite(frau);
  await invite(oma);
  for (const [n, u] of Object.entries({ josia, frau, oma, opa })) P[n] = (await call(u, "GET", "/me")).body.profile.id;
});

describe("Neue Gruppenmitglieder und laufende Events", () => {
  it("Freies Schenken mit ganzer Gruppe: automatisch hinzugefügt, keine Nachricht", async () => {
    const id = await newEvent(frau, { type: "standard", name: "Weihnachten" });
    await invite(opa);
    expect(await participants(id)).toEqual(["Frau", "Josia", "Oma", "Opa"]);
    expect((await notes(frau)).items).toEqual([]);
    expect((await notes(josia)).items).toEqual([]);
  });

  it("Event mit Auswahl: nicht hinzufügen, Ersteller und Admins benachrichtigen", async () => {
    const id = await newEvent(frau, { type: "standard", name: "Omas Geburtstag" });
    await call(josia, "PUT", `/events/${id}/participants`, { profileIds: [P.josia, P.frau] });
    await invite(opa);
    expect(await participants(id)).toEqual(["Frau", "Josia"]);
    for (const u of [frau, josia]) {
      const n = await notes(u);
      expect(n.unread).toBe(1);
      expect(n.items[0]).toMatchObject({ title: "Neu in „Familie“: Opa", linkPath: `/events/${id}`, linkLabel: "Zum Event", read: false });
    }
    expect((await notes(oma)).items).toEqual([]); // kein Admin, nicht Ersteller
    expect((await notes(opa)).items).toEqual([]); // die neue Person selbst nicht
  });

  it("Wichteln: immer Nachricht, nach der Auslosung mit Hinweis zum Neu-Auslosen", async () => {
    const offen = await newEvent(josia, { type: "secret_santa", name: "Wichteln offen" });
    const gelost = await newEvent(josia, { type: "secret_santa", name: "Wichteln gelost" });
    await call(josia, "POST", `/events/${gelost}/draw`);
    await invite(opa);
    expect(await participants(offen)).toEqual(["Frau", "Josia", "Oma"]);
    const items = (await notes(josia)).items;
    expect(items).toHaveLength(2);
    expect(items.find((n: any) => n.linkPath === `/events/${gelost}`).body).toContain("bereits ausgelost");
    expect(items.find((n: any) => n.linkPath === `/events/${offen}`).body).toContain("Wer macht mit?");
  });

  it("vergangene Events bleiben unberührt", async () => {
    const id = await newEvent(josia, { type: "standard", name: "Letztes Jahr", date: "2020-12-24" });
    await invite(opa);
    expect(await participants(id)).toEqual(["Frau", "Josia", "Oma"]);
    expect((await notes(josia)).items).toEqual([]);
  });

  it("gilt auch, wenn Eltern ein Kind in die Gruppe aufnehmen (ohne sich selbst zu benachrichtigen)", async () => {
    const std = await newEvent(josia, { type: "standard", name: "Weihnachten" });
    const santa = await newEvent(josia, { type: "secret_santa", name: "Wichteln" });
    const kind = (await call(frau, "POST", "/children", { displayName: "Emil" })).body.id;
    await call(frau, "POST", `/children/${kind}/groups`, { groupId: g });
    expect(await participants(std)).toContain("Emil");
    expect((await notes(josia)).items.map((n: any) => n.linkPath)).toEqual([`/events/${santa}`]);
    expect((await notes(frau)).items).toEqual([]);
  });

  it("Benachrichtigungen als gelesen markieren", async () => {
    await newEvent(josia, { type: "secret_santa", name: "Wichteln" });
    await invite(opa);
    const n = await notes(josia);
    await call(josia, "POST", `/notifications/${n.items[0].id}/read`);
    expect((await notes(josia)).unread).toBe(0);
    await call(oma, "POST", `/notifications/${n.items[0].id}/read`); // fremde Nachricht: keine Wirkung
    await newEvent(josia, { type: "secret_santa", name: "Noch eins" });
    await invite(await createUser("Tante"));
    expect((await notes(josia)).unread).toBe(2);
    await call(josia, "POST", "/notifications/read-all");
    expect((await notes(josia)).unread).toBe(0);
  });
});
