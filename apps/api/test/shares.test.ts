import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { app } from "../src/app.ts";
import { call, createUser, fetchRaw, resetDb, upload, type TestUser } from "./helpers.ts";

let anna: TestUser, ben: TestUser, fremd: TestUser;
let annaP: string, familie: string;

/** Anfrage als Gast (ohne Konto) */
async function guest(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function newShare(label = "Patenonkel Peter", by: TestUser = anna, profileId = annaP) {
  const res = await call(by, "POST", `/profiles/${profileId}/shares`, { label });
  return { ...res.body, token: (res.body.url as string).split("/").pop()! };
}
const addWish = async (body: object) => (await call(anna, "POST", `/profiles/${annaP}/wishes`, body)).body as { id: string };

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

describe("Gäste ohne Konto (Identität = Link)", () => {
  it("sehen nur Wünsche, die für alle Gruppen sichtbar sind", async () => {
    await addWish({ title: "Für alle" });
    await addWish({ title: "Nur Familie", visibleInAllGroups: false, groupIds: [familie] });
    const archiviert = await addWish({ title: "Archiviert" });
    await call(anna, "POST", `/wishes/${archiviert.id}/archive`);
    const s = await newShare();
    expect((await guest("GET", `/share/${s.token}`)).body.wishes.map((w: any) => w.title)).toEqual(["Für alle"]);
  });

  it("Reservierung gilt für den Link: in jedem Browser 'von dir reserviert'", async () => {
    const w = await addWish({ title: "Uhr" });
    const s = await newShare();
    // "Browser 1" reserviert, ohne Namen oder Anmeldung
    expect((await guest("POST", `/share/${s.token}/wishes/${w.id}/reserve`)).status).toBe(201);
    // "Browser 2" (privates Fenster, anderes Gerät …) sieht es ebenfalls als eigene Reservierung
    expect((await guest("GET", `/share/${s.token}`)).body.wishes[0].reservation).toBe("reserved_by_me");
    // und kann sie auch aufheben
    expect((await guest("DELETE", `/share/${s.token}/wishes/${w.id}/reserve`)).status).toBe(200);
    expect((await guest("GET", `/share/${s.token}`)).body.wishes[0].reservation).toBe("available");
  });

  it("verschiedene Links sind verschiedene Personen; Familie und Gäste sehen gegenseitig nur 'reserviert'", async () => {
    const w1 = await addWish({ title: "Uhr" });
    const w2 = await addWish({ title: "Buch" });
    const w3 = await addWish({ title: "Schal" });
    const peter = await newShare("Peter");
    const paula = await newShare("Paula");
    await guest("POST", `/share/${peter.token}/wishes/${w1.id}/reserve`);
    await guest("POST", `/share/${paula.token}/wishes/${w2.id}/reserve`);
    await call(ben, "POST", `/wishes/${w3.id}/reserve`);

    const status = (view: any) => Object.fromEntries(view.wishes.map((w: any) => [w.title, w.reservation]));
    expect(status((await guest("GET", `/share/${peter.token}`)).body)).toEqual({ Uhr: "reserved_by_me", Buch: "reserved", Schal: "reserved" });
    expect(status((await guest("GET", `/share/${paula.token}`)).body)).toEqual({ Uhr: "reserved", Buch: "reserved_by_me", Schal: "reserved" });
    const benView = (await call(ben, "GET", `/profiles/${annaP}/list`)).body;
    expect(status(benView)).toEqual({ Uhr: "reserved", Buch: "reserved", Schal: "reserved_by_me" });
    expect(JSON.stringify(benView)).not.toMatch(/Peter|Paula/);

    // Fremde Reservierungen kann man weder übernehmen noch aufheben
    expect((await guest("POST", `/share/${paula.token}/wishes/${w1.id}/reserve`)).status).toBe(409);
    expect((await guest("DELETE", `/share/${paula.token}/wishes/${w1.id}/reserve`)).status).toBe(404);
    expect((await call(ben, "POST", `/wishes/${w1.id}/reserve`)).status).toBe(409);
  });

  it("die Wünschende sieht weiterhin nichts und kann den eigenen Link angemeldet nicht öffnen", async () => {
    const w = await addWish({ title: "Uhr" });
    const s = await newShare();
    await guest("POST", `/share/${s.token}/wishes/${w.id}/reserve`);
    expect(JSON.stringify((await call(anna, "GET", `/profiles/${annaP}/wishes`)).body).toLowerCase()).not.toContain("reserv");
    expect((await call(anna, "GET", `/share/${s.token}`)).status).toBe(403);
    expect((await call(ben, "GET", `/share/${s.token}`)).status).toBe(200);
  });

  it("Reservierungen bleiben bestehen, wenn der Link zurückgezogen wird", async () => {
    const w = await addWish({ title: "Uhr" });
    const s = await newShare();
    await guest("POST", `/share/${s.token}/wishes/${w.id}/reserve`);
    await call(anna, "DELETE", `/shares/${s.id}`);
    expect((await guest("GET", `/share/${s.token}`)).status).toBe(404);
    expect((await call(ben, "GET", `/profiles/${annaP}/list`)).body.wishes[0].reservation).toBe("reserved");
  });

  it("Hinweise bei Änderung und Löschung", async () => {
    const a = await addWish({ title: "Geändert" });
    const d = await addWish({ title: "Gelöscht" });
    const s = await newShare();
    await guest("POST", `/share/${s.token}/wishes/${a.id}/reserve`);
    await guest("POST", `/share/${s.token}/wishes/${d.id}/reserve`);
    await new Promise((r) => setTimeout(r, 20));
    await call(anna, "PATCH", `/wishes/${a.id}`, { title: "Geändert (blau)" });
    await call(anna, "DELETE", `/wishes/${d.id}`);
    const mine = (await guest("GET", `/share/${s.token}`)).body.myReservations;
    expect(Object.fromEntries(mine.map((r: any) => [r.title, r.state]))).toEqual({ "Geändert (blau)": "changed", Gelöscht: "deleted" });
    await guest("POST", `/share/${s.token}/reservations/${a.id}/acknowledge`);
    await guest("DELETE", `/share/${s.token}/wishes/${d.id}/reserve`);
    expect((await guest("GET", `/share/${s.token}`)).body.myReservations).toEqual([expect.objectContaining({ state: "ok" })]);
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
