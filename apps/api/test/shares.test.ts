import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { app } from "../src/app.ts";
import { call, createUser, fetchRaw, resetDb, upload, type TestUser } from "./helpers.ts";

let anna: TestUser, ben: TestUser, fremd: TestUser;
let annaP: string, familie: string;

/** Anfrage als Gast (ohne Konto), optional mit Gast-Schlüssel */
async function guest(method: string, path: string, guestToken?: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...(guestToken ? { "x-guest-token": guestToken } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function newShare(label = "Patenonkel Peter", by: TestUser = anna, profileId = annaP) {
  const res = await call(by, "POST", `/profiles/${profileId}/shares`, { label });
  return { ...res.body, token: (res.body.url as string).split("/").pop()! };
}
const addWish = async (body: object) => (await call(anna, "POST", `/profiles/${annaP}/wishes`, body)).body as { id: string };
const joinAs = async (token: string, name = "Peter") => (await guest("POST", `/share/${token}/guest`, undefined, { name })).body.guestToken as string;

beforeEach(async () => {
  await resetDb();
  anna = await createUser("Anna");
  ben = await createUser("Ben");
  fremd = await createUser("Fremd");
  annaP = (await call(anna, "GET", "/me")).body.profile.id;
  familie = (await call(anna, "POST", "/groups", { name: "Familie" })).body.id;
  const inv = await call(anna, "POST", `/groups/${familie}/invites`, {});
  await call(ben, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
});

describe("Teilen-Links verwalten", () => {
  it("nur Besitzer bzw. Eltern legen Links an; Liste enthält keine Gast- oder Reservierungsinfos", async () => {
    expect((await call(ben, "POST", `/profiles/${annaP}/shares`, { label: "X" })).status).toBe(404);
    const s = await newShare();
    const list = (await call(anna, "GET", `/profiles/${annaP}/shares`)).body;
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["createdAt", "expiresAt", "id", "label", "url"]);
    expect(s.url).toContain("/teilen/");
  });

  it("zurückgezogene Links funktionieren nicht mehr", async () => {
    const s = await newShare();
    expect((await call(ben, "DELETE", `/shares/${s.id}`)).status).toBe(404);
    expect((await call(anna, "DELETE", `/shares/${s.id}`)).status).toBe(200);
    expect((await guest("GET", `/share/${s.token}`)).status).toBe(404);
    expect((await call(anna, "GET", `/profiles/${annaP}/shares`)).body).toEqual([]);
  });

  it("Eltern können die Liste ihres Kindes teilen", async () => {
    const kind = (await call(anna, "POST", "/children", { displayName: "Emil" })).body.id;
    await call(anna, "POST", `/profiles/${kind}/wishes`, { title: "Bagger" });
    const s = await newShare("Pate", anna, kind);
    expect((await guest("GET", `/share/${s.token}`)).body).toMatchObject({ profile: { displayName: "Emil" }, wishes: [{ title: "Bagger" }] });
  });
});

describe("Gäste ohne Konto", () => {
  it("sehen nur Wünsche, die für alle Gruppen sichtbar sind", async () => {
    await addWish({ title: "Für alle" });
    await addWish({ title: "Nur Familie", visibleInAllGroups: false, groupIds: [familie] });
    const archiviert = await addWish({ title: "Archiviert" });
    await call(anna, "POST", `/wishes/${archiviert.id}/archive`);
    const s = await newShare();
    const view = (await guest("GET", `/share/${s.token}`)).body;
    expect(view.wishes.map((w: any) => w.title)).toEqual(["Für alle"]);
    expect(view.guest).toBeNull();
  });

  it("reservieren nur nach Namensangabe; Familie und Gast sehen gegenseitig nur 'reserviert'", async () => {
    const w1 = await addWish({ title: "Uhr" });
    const w2 = await addWish({ title: "Buch" });
    const s = await newShare();
    expect((await guest("POST", `/share/${s.token}/wishes/${w1.id}/reserve`)).status).toBe(401);

    const peter = await joinAs(s.token);
    expect((await guest("POST", `/share/${s.token}/wishes/${w1.id}/reserve`, peter)).status).toBe(201);
    await call(ben, "POST", `/wishes/${w2.id}/reserve`);

    const g = (await guest("GET", `/share/${s.token}`, peter)).body;
    expect(g.guest).toEqual({ name: "Peter" });
    expect(Object.fromEntries(g.wishes.map((w: any) => [w.title, w.reservation]))).toEqual({ Uhr: "reserved_by_me", Buch: "reserved" });
    expect(JSON.stringify(g)).not.toContain("Ben");

    const benView = (await call(ben, "GET", `/profiles/${annaP}/list`)).body;
    expect(Object.fromEntries(benView.wishes.map((w: any) => [w.title, w.reservation]))).toEqual({ Uhr: "reserved", Buch: "reserved_by_me" });
    expect(JSON.stringify(benView)).not.toContain("Peter");

    // Familie kann den vom Gast reservierten Wunsch nicht reservieren und umgekehrt
    expect((await call(ben, "POST", `/wishes/${w1.id}/reserve`)).status).toBe(409);
    expect((await guest("POST", `/share/${s.token}/wishes/${w2.id}/reserve`, peter)).status).toBe(409);
  });

  it("die Wünschende sieht weiterhin nichts und kann den eigenen Link angemeldet nicht öffnen", async () => {
    const w = await addWish({ title: "Uhr" });
    const s = await newShare();
    const peter = await joinAs(s.token);
    await guest("POST", `/share/${s.token}/wishes/${w.id}/reserve`, peter);
    expect(JSON.stringify((await call(anna, "GET", `/profiles/${annaP}/wishes`)).body).toLowerCase()).not.toContain("reserv");
    expect((await call(anna, "GET", `/share/${s.token}`)).status).toBe(403);
    // Ein anderes angemeldetes Familienmitglied darf den Link öffnen
    expect((await call(ben, "GET", `/share/${s.token}`)).status).toBe(200);
  });

  it("nur der reservierende Gast kann freigeben; ein Schlüssel gilt nur für seinen Link", async () => {
    const w = await addWish({ title: "Uhr" });
    const s1 = await newShare("Peter");
    const s2 = await newShare("Paula");
    const peter = await joinAs(s1.token, "Peter");
    const paula = await joinAs(s2.token, "Paula");
    await guest("POST", `/share/${s1.token}/wishes/${w.id}/reserve`, peter);
    expect((await guest("DELETE", `/share/${s2.token}/wishes/${w.id}/reserve`, paula)).status).toBe(404);
    expect((await guest("GET", `/share/${s1.token}`, paula)).body.guest).toBeNull();
    expect((await guest("DELETE", `/share/${s1.token}/wishes/${w.id}/reserve`, peter)).status).toBe(200);
    expect((await call(ben, "GET", `/profiles/${annaP}/list`)).body.wishes[0].reservation).toBe("available");
  });

  it("Gäste bekommen Hinweise bei Änderung und Löschung", async () => {
    const a = await addWish({ title: "Geändert" });
    const d = await addWish({ title: "Gelöscht" });
    const s = await newShare();
    const peter = await joinAs(s.token);
    await guest("POST", `/share/${s.token}/wishes/${a.id}/reserve`, peter);
    await guest("POST", `/share/${s.token}/wishes/${d.id}/reserve`, peter);
    await new Promise((r) => setTimeout(r, 20));
    await call(anna, "PATCH", `/wishes/${a.id}`, { title: "Geändert (blau)" });
    await call(anna, "DELETE", `/wishes/${d.id}`);
    const mine = (await guest("GET", `/share/${s.token}`, peter)).body.myReservations;
    expect(Object.fromEntries(mine.map((r: any) => [r.title, r.state]))).toEqual({ "Geändert (blau)": "changed", Gelöscht: "deleted" });
    await guest("POST", `/share/${s.token}/reservations/${a.id}/acknowledge`, peter);
    await guest("DELETE", `/share/${s.token}/wishes/${d.id}/reserve`, peter);
    expect((await guest("GET", `/share/${s.token}`, peter)).body.myReservations).toEqual([expect.objectContaining({ state: "ok" })]);
  });

  it("Bilder sind über den Link abrufbar, aber nur für sichtbare Wünsche", async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#f00" } }).png().toBuffer();
    const sichtbar = await addWish({ title: "Sichtbar" });
    const versteckt = await addWish({ title: "Versteckt", visibleInAllGroups: false, groupIds: [familie] });
    const img1 = (await upload(anna, `/wishes/${sichtbar.id}/images`, png, "a.png", "image/png")).body;
    const img2 = (await upload(anna, `/wishes/${versteckt.id}/images`, png, "a.png", "image/png")).body;
    const s = await newShare();
    expect((await fetchRaw(null, `/share/${s.token}/images/${img1.id}/thumb`)).status).toBe(200);
    expect((await fetchRaw(null, `/share/${s.token}/images/${img2.id}/thumb`)).status).toBe(404);
    // Bild eines fremden Profils über diesen Link: nicht abrufbar
    const fremdP = (await call(fremd, "GET", "/me")).body.profile.id;
    const fw = (await call(fremd, "POST", `/profiles/${fremdP}/wishes`, { title: "X" })).body;
    const fimg = (await upload(fremd, `/wishes/${fw.id}/images`, png, "a.png", "image/png")).body;
    expect((await fetchRaw(null, `/share/${s.token}/images/${fimg.id}`)).status).toBe(404);
  });

  it("abgelaufene Links funktionieren nicht", async () => {
    const res = await call(anna, "POST", `/profiles/${annaP}/shares`, { label: "Kurz", expiresInDays: 1 });
    const token = res.body.url.split("/").pop();
    expect((await guest("GET", `/share/${token}`)).status).toBe(200);
    const { db } = await import("../src/db/index.ts");
    const { shareLink } = await import("../src/db/schema.ts");
    await db.update(shareLink).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await guest("GET", `/share/${token}`)).status).toBe(404);
  });
});
