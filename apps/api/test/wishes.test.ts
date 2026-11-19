import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { reservation, wish } from "../src/db/schema.ts";
import { call, createUser, resetDb, type TestUser } from "./helpers.ts";

let anna: TestUser, ben: TestUser;
let annaProfile: string;

beforeEach(async () => {
  await resetDb();
  anna = await createUser("Anna");
  ben = await createUser("Ben");
  annaProfile = (await call(anna, "GET", "/me")).body.profile.id;
});

const addWish = (who: TestUser, profileId: string, body: object) => call(who, "POST", `/profiles/${profileId}/wishes`, body);
const list = (who: TestUser, profileId: string, status = "active") =>
  call(who, "GET", `/profiles/${profileId}/wishes?status=${status}`);

describe("Eigene Wünsche", () => {
  it("anlegen mit Links und Preis, neuester steht oben", async () => {
    await addWish(anna, annaProfile, { title: "Buch" });
    const res = await addWish(anna, annaProfile, {
      title: "Kopfhörer",
      description: "Over-Ear, schwarz",
      priceCents: 7999,
      links: [{ url: "shop.example.com/kopfhoerer" }, { url: "https://example.org/x", label: "Alternative" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.links.map((l: any) => l.url)).toEqual(["https://shop.example.com/kopfhoerer", "https://example.org/x"]);
    const all = await list(anna, annaProfile);
    expect(all.body.map((w: any) => w.title)).toEqual(["Kopfhörer", "Buch"]);
  });

  it("ungültige Eingaben werden abgelehnt", async () => {
    expect((await addWish(anna, annaProfile, { title: "" })).status).toBe(400);
    expect((await addWish(anna, annaProfile, { title: "X", links: [{ url: "javascript:alert(1)" }] })).status).toBe(400);
    expect((await addWish(anna, annaProfile, { title: "X", links: [{ url: "keinlink" }] })).status).toBe(400);
  });

  it("bearbeiten ersetzt Links", async () => {
    const w = (await addWish(anna, annaProfile, { title: "Alt", links: [{ url: "https://a.example.com" }] })).body;
    const res = await call(anna, "PATCH", `/wishes/${w.id}`, { title: "Neu", links: [{ url: "https://b.example.com" }] });
    expect(res.body).toMatchObject({ title: "Neu", links: [{ url: "https://b.example.com" }] });
  });

  it("Fremde können die Liste weder lesen noch bearbeiten (404)", async () => {
    const w = (await addWish(anna, annaProfile, { title: "Geheim" })).body;
    expect((await list(ben, annaProfile)).status).toBe(404);
    expect((await addWish(ben, annaProfile, { title: "Untergeschoben" })).status).toBe(404);
    expect((await call(ben, "PATCH", `/wishes/${w.id}`, { title: "Gehackt" })).status).toBe(404);
    expect((await call(ben, "DELETE", `/wishes/${w.id}`)).status).toBe(404);
    expect((await call(ben, "POST", `/wishes/${w.id}/archive`)).status).toBe(404);
  });

  it("archivieren und wiederherstellen", async () => {
    const w = (await addWish(anna, annaProfile, { title: "Fahrrad" })).body;
    await call(anna, "POST", `/wishes/${w.id}/archive`);
    expect((await list(anna, annaProfile)).body).toEqual([]);
    expect((await list(anna, annaProfile, "archived")).body[0]).toMatchObject({ title: "Fahrrad", status: "archived" });
    await call(anna, "POST", `/wishes/${w.id}/restore`);
    expect((await list(anna, annaProfile)).body[0]).toMatchObject({ title: "Fahrrad", status: "active" });
  });

  it("Reihenfolge speichern", async () => {
    const a = (await addWish(anna, annaProfile, { title: "A" })).body;
    const b = (await addWish(anna, annaProfile, { title: "B" })).body;
    const c = (await addWish(anna, annaProfile, { title: "C" })).body;
    await call(anna, "PUT", `/profiles/${annaProfile}/wishes/order`, { ids: [a.id, c.id, b.id] });
    expect((await list(anna, annaProfile)).body.map((w: any) => w.title)).toEqual(["A", "C", "B"]);
  });
});

describe("Sichtbarkeit pro Gruppe", () => {
  it("nur eigene Gruppen auswählbar", async () => {
    const g1 = (await call(anna, "POST", "/groups", { name: "Familie A" })).body.id;
    const fremd = (await call(ben, "POST", "/groups", { name: "Familie B" })).body.id;
    const ok = await addWish(anna, annaProfile, { title: "X", visibleInAllGroups: false, groupIds: [g1] });
    expect(ok.body).toMatchObject({ visibleInAllGroups: false, groupIds: [g1] });
    const bad = await addWish(anna, annaProfile, { title: "Y", visibleInAllGroups: false, groupIds: [fremd] });
    expect(bad.status).toBe(400);
  });

  it("Gruppenliste des Profils", async () => {
    await call(anna, "POST", "/groups", { name: "Familie A" });
    const res = await call(anna, "GET", `/profiles/${annaProfile}/groups`);
    expect(res.body.map((g: any) => g.name)).toEqual(["Familie A"]);
  });
});

describe("Reservierungen bleiben für den Besitzer unsichtbar", () => {
  it("die Besitzer-Sicht enthält keinerlei Reservierungsdaten", async () => {
    const w = (await addWish(anna, annaProfile, { title: "Uhr" })).body;
    await db.insert(reservation).values({ wishId: w.id, reservedByUserId: ben.id });
    const res = await list(anna, annaProfile);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("reserv");
    expect(Object.keys(res.body[0]).sort()).toEqual(
      ["archivedAt", "createdAt", "description", "groupIds", "id", "images", "links", "priceCents", "status", "title", "updatedAt", "visibleInAllGroups"].sort(),
    );
  });

  it("Löschen eines reservierten Wunsches: gleiche Antwort, aber Soft-Delete für den Reservierenden", async () => {
    const reserved = (await addWish(anna, annaProfile, { title: "Reserviert" })).body;
    const free = (await addWish(anna, annaProfile, { title: "Frei" })).body;
    await db.insert(reservation).values({ wishId: reserved.id, reservedByUserId: ben.id });

    const r1 = await call(anna, "DELETE", `/wishes/${reserved.id}`);
    const r2 = await call(anna, "DELETE", `/wishes/${free.id}`);
    expect(r1).toEqual(r2);
    expect((await list(anna, annaProfile)).body).toEqual([]);

    const [soft] = await db.select().from(wish).where(eq(wish.id, reserved.id));
    expect(soft?.status).toBe("deleted");
    expect((await db.select().from(wish).where(eq(wish.id, free.id))).length).toBe(0);
    // gelöschte Wünsche kann der Besitzer nicht mehr bearbeiten
    expect((await call(anna, "PATCH", `/wishes/${reserved.id}`, { title: "Doch nicht" })).status).toBe(404);
  });
});
