/**
 * Tests für das Herzstück: Wer sieht welche Wünsche und welche Reservierungen?
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { groupMember, profile, profileGuardian, wish } from "../src/db/schema.ts";
import { call, createUser, resetDb, type TestUser } from "./helpers.ts";

// Familie: Anna (Wünschende), Ben und Cara (Schenkende) in "Familie", Dora nur in "Freunde" mit Anna,
// Erik in keiner gemeinsamen Gruppe.
let anna: TestUser, ben: TestUser, cara: TestUser, dora: TestUser, erik: TestUser;
let annaP: string;
let familie: string, freunde: string;

async function profileOf(u: TestUser) {
  return (await call(u, "GET", "/me")).body.profile.id as string;
}
async function join(admin: TestUser, groupId: string, u: TestUser) {
  const inv = await call(admin, "POST", `/groups/${groupId}/invites`, {});
  await call(u, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
}
async function addWish(body: object) {
  return (await call(anna, "POST", `/profiles/${annaP}/wishes`, body)).body as { id: string };
}
const view = (u: TestUser, profileId = annaP) => call(u, "GET", `/profiles/${profileId}/list`);
const reserve = (u: TestUser, wishId: string) => call(u, "POST", `/wishes/${wishId}/reserve`);
const release = (u: TestUser, wishId: string) => call(u, "DELETE", `/wishes/${wishId}/reserve`);
const statusOf = async (u: TestUser, wishId: string) =>
  (await view(u)).body.wishes.find((w: any) => w.id === wishId)?.reservation;

beforeEach(async () => {
  await resetDb();
  anna = await createUser("Anna");
  ben = await createUser("Ben");
  cara = await createUser("Cara");
  dora = await createUser("Dora");
  erik = await createUser("Erik");
  annaP = await profileOf(anna);
  familie = (await call(anna, "POST", "/groups", { name: "Familie" })).body.id;
  freunde = (await call(anna, "POST", "/groups", { name: "Freunde" })).body.id;
  await join(anna, familie, ben);
  await join(anna, familie, cara);
  await join(anna, freunde, dora);
});

describe("Sichtbarkeit der Liste", () => {
  it("Gruppenmitglieder sehen die Liste, Fremde nicht", async () => {
    await addWish({ title: "Buch" });
    expect((await view(ben)).body.wishes.map((w: any) => w.title)).toEqual(["Buch"]);
    expect((await view(dora)).body.wishes.map((w: any) => w.title)).toEqual(["Buch"]);
    expect((await view(erik)).status).toBe(404);
  });

  it("die eigene Liste ist über die Schenkenden-Sicht nicht abrufbar", async () => {
    await addWish({ title: "Buch" });
    expect((await view(anna)).status).toBe(404);
  });

  it("auf Gruppen beschränkte Wünsche sind nur dort sichtbar", async () => {
    const nurFamilie = await addWish({ title: "Nur Familie", visibleInAllGroups: false, groupIds: [familie] });
    await addWish({ title: "Nur für mich", visibleInAllGroups: false, groupIds: [] });
    await addWish({ title: "Für alle" });
    expect((await view(ben)).body.wishes.map((w: any) => w.title).sort()).toEqual(["Für alle", "Nur Familie"]);
    expect((await view(dora)).body.wishes.map((w: any) => w.title)).toEqual(["Für alle"]);
    // Dora kann den unsichtbaren Wunsch auch nicht direkt reservieren
    expect((await reserve(dora, nurFamilie.id)).status).toBe(404);
  });

  it("archivierte Wünsche sind für andere unsichtbar und nicht reservierbar", async () => {
    const w = await addWish({ title: "Alt" });
    await call(anna, "POST", `/wishes/${w.id}/archive`);
    expect((await view(ben)).body.wishes).toEqual([]);
    expect((await reserve(ben, w.id)).status).toBe(404);
  });
});

describe("Reservieren", () => {
  it("drei Sichten: verfügbar / von mir reserviert / reserviert, ohne Namen", async () => {
    const w = await addWish({ title: "Uhr" });
    expect(await statusOf(ben, w.id)).toBe("available");
    expect((await reserve(ben, w.id)).status).toBe(201);
    expect(await statusOf(ben, w.id)).toBe("reserved_by_me");
    expect(await statusOf(cara, w.id)).toBe("reserved");

    const caraView = JSON.stringify((await view(cara)).body);
    expect(caraView).not.toContain(ben.id);
    expect(caraView).not.toContain("Ben");
  });

  it("der Wünschende sieht weiterhin nichts", async () => {
    const w = await addWish({ title: "Uhr" });
    await reserve(ben, w.id);
    const own = await call(anna, "GET", `/profiles/${annaP}/wishes`);
    expect(JSON.stringify(own.body).toLowerCase()).not.toContain("reserv");
    expect(JSON.stringify(own.body)).not.toContain(ben.id);
  });

  it("kein doppeltes Reservieren", async () => {
    const w = await addWish({ title: "Uhr" });
    await reserve(ben, w.id);
    expect((await reserve(cara, w.id)).status).toBe(409);
    expect((await reserve(ben, w.id)).status).toBe(200); // eigene erneut: harmlos
  });

  it("gleichzeitiges Reservieren: genau einer gewinnt", async () => {
    const w = await addWish({ title: "Konsole" });
    const results = await Promise.all([reserve(ben, w.id), reserve(cara, w.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("eigene Wünsche kann man nicht reservieren", async () => {
    const w = await addWish({ title: "Uhr" });
    expect((await reserve(anna, w.id)).status).toBe(404);
  });

  it("nur der Reservierende kann freigeben", async () => {
    const w = await addWish({ title: "Uhr" });
    await reserve(ben, w.id);
    expect((await release(cara, w.id)).status).toBe(404);
    expect((await release(anna, w.id)).status).toBe(404);
    expect(await statusOf(cara, w.id)).toBe("reserved");
    expect((await release(ben, w.id)).status).toBe(200);
    expect(await statusOf(cara, w.id)).toBe("available");
  });
});

describe("Meine Reservierungen und Hinweise", () => {
  const mine = async (u: TestUser) => (await call(u, "GET", "/reservations")).body as any[];

  it("Übersicht mit Person und Status", async () => {
    const w = await addWish({ title: "Uhr", priceCents: 5000 });
    await reserve(ben, w.id);
    expect(await mine(ben)).toEqual([
      expect.objectContaining({ wishId: w.id, title: "Uhr", priceCents: 5000, state: "ok", profile: { id: annaP, displayName: "Anna" } }),
    ]);
    expect(await mine(cara)).toEqual([]);
  });

  it("Änderung durch den Wünschenden wird angezeigt, bis sie gesehen wurde", async () => {
    const w = await addWish({ title: "Uhr" });
    await reserve(ben, w.id);
    await new Promise((r) => setTimeout(r, 20));
    await call(anna, "PATCH", `/wishes/${w.id}`, { title: "Uhr (silber)" });
    expect((await mine(ben))[0].state).toBe("changed");
    expect((await view(ben)).body.wishes[0].changedSinceReservation).toBe(true);
    await call(ben, "POST", `/reservations/${w.id}/acknowledge`);
    expect((await mine(ben))[0].state).toBe("ok");
  });

  it("Umsortieren zählt nicht als Änderung", async () => {
    const a = await addWish({ title: "A" });
    const b = await addWish({ title: "B" });
    await reserve(ben, a.id);
    await new Promise((r) => setTimeout(r, 20));
    await call(anna, "PUT", `/profiles/${annaP}/wishes/order`, { ids: [a.id, b.id] });
    expect((await mine(ben))[0].state).toBe("ok");
  });

  it("archiviert und gelöscht", async () => {
    const a = await addWish({ title: "Archiviert" });
    const d = await addWish({ title: "Gelöscht" });
    await reserve(ben, a.id);
    await reserve(ben, d.id);
    await call(anna, "POST", `/wishes/${a.id}/archive`);
    await call(anna, "DELETE", `/wishes/${d.id}`);
    const states = Object.fromEntries((await mine(ben)).map((r) => [r.title, r.state]));
    expect(states).toEqual({ Archiviert: "archived", Gelöscht: "deleted" });
    // Freigeben eines gelöschten Wunsches entfernt ihn endgültig
    await release(ben, d.id);
    expect((await db.select().from(wish).where(eq(wish.id, d.id))).length).toBe(0);
  });

  it("kein Zugriff mehr, wenn man die Gruppe verlässt", async () => {
    const w = await addWish({ title: "Uhr" });
    await reserve(ben, w.id);
    const benP = await profileOf(ben);
    await call(ben, "DELETE", `/groups/${familie}/members/${benP}`);
    expect((await mine(ben))[0].state).toBe("no_access");
    expect((await release(ben, w.id)).status).toBe(200);
  });
});

describe("Kinderprofile (von Eltern verwaltet)", () => {
  it("Eltern sehen den Reservierungsstatus auf der Liste ihres Kindes", async () => {
    // Kinderprofil ohne Konto, Anna ist Erziehungsberechtigte, Kind ist in "Familie"
    const [kind] = await db.insert(profile).values({ displayName: "Emil" }).returning();
    await db.insert(profileGuardian).values({ profileId: kind!.id, guardianUserId: anna.id });
    await db.insert(groupMember).values({ groupId: familie, profileId: kind!.id });

    const w = (await call(anna, "POST", `/profiles/${kind!.id}/wishes`, { title: "Bagger" })).body;
    expect((await call(ben, "POST", `/wishes/${w.id}/reserve`)).status).toBe(201);

    const annaView = await call(anna, "GET", `/profiles/${kind!.id}/list`);
    expect(annaView.body.wishes[0].reservation).toBe("reserved");
    // Ben (nicht erziehungsberechtigt) kann die Liste nicht bearbeiten
    expect((await call(ben, "POST", `/profiles/${kind!.id}/wishes`, { title: "X" })).status).toBe(404);
  });
});
