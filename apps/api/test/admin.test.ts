import { beforeEach, describe, expect, it } from "vitest";
import { eq, gt } from "drizzle-orm";
import { app } from "../src/app.ts";
import { db } from "../src/db/index.ts";
import { adminAccount, wish } from "../src/db/schema.ts";
import { hashPassword, resetAdminLoginLimits } from "../src/services/admin-auth.ts";
import { call, createUser, resetDb, signIn, type TestUser } from "./helpers.ts";

const ADMIN_PW = "sehr-geheimes-admin-passwort";
let anna: TestUser, ben: TestUser;
let annaP: string, g: string;

async function raw(method: string, path: string, opts: { cookie?: string; body?: unknown; origin?: string } = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: opts.origin ?? "http://localhost:5173",
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any, setCookie: res.headers.get("set-cookie") };
}
async function adminCookie() {
  const res = await raw("POST", "/admin/login", { body: { email: "admin@example.com", password: ADMIN_PW } });
  expect(res.status).toBe(200);
  return res.setCookie!.split(";")[0]!;
}
let cookie: string | undefined;
/** Admin-Aufruf; meldet sich pro Test nur einmal an (scrypt ist absichtlich langsam) */
const admin = async (method: string, path: string, body?: unknown) => {
  cookie ??= await adminCookie();
  return raw(method, `/admin${path}`, { cookie, body });
};

beforeEach(async () => {
  await resetDb();
  resetAdminLoginLimits();
  cookie = undefined;
  await db.insert(adminAccount).values({ email: "admin@example.com", passwordHash: await hashPassword(ADMIN_PW) });
  anna = await createUser("Anna");
  ben = await createUser("Ben");
  annaP = (await call(anna, "GET", "/me")).body.profile.id;
  g = (await call(anna, "POST", "/groups", { name: "Familie" })).body.id;
  const inv = await call(anna, "POST", `/groups/${g}/invites`, {});
  await call(ben, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
});

describe("Admin-Anmeldung", () => {
  it("ohne Admin-Sitzung kein Zugriff, auch nicht mit normalem Konto", async () => {
    expect((await raw("GET", "/admin/users")).status).toBe(401);
    expect((await raw("GET", "/admin/users", { cookie: anna.cookie })).status).toBe(401);
  });

  it("falsches Passwort wird abgelehnt, richtiges setzt ein HttpOnly-Cookie nur für /api/admin", async () => {
    expect((await raw("POST", "/admin/login", { body: { email: "admin@example.com", password: "falsch" } })).status).toBe(401);
    expect((await raw("POST", "/admin/login", { body: { email: "anna-1@example.com", password: "test-passwort-123" } })).status).toBe(401);
    const res = await raw("POST", "/admin/login", { body: { email: "Admin@Example.com", password: ADMIN_PW } });
    expect(res.status).toBe(200);
    expect(res.setCookie).toMatch(/HttpOnly/i);
    expect(res.setCookie).toMatch(/Path=\/api\/admin/);
    expect(res.setCookie).toMatch(/SameSite=Strict/i);
  });

  it("nach 5 Fehlversuchen gesperrt, auch für das richtige Passwort", async () => {
    for (let i = 0; i < 5; i++) await raw("POST", "/admin/login", { body: { email: "admin@example.com", password: "falsch" } });
    expect((await raw("POST", "/admin/login", { body: { email: "admin@example.com", password: ADMIN_PW } })).status).toBe(429);
  });

  it("Abmelden beendet die Sitzung; fremde Herkunft wird bei Änderungen abgelehnt", async () => {
    const cookie = await adminCookie();
    expect((await raw("DELETE", `/admin/users/${ben.id}`, { cookie, origin: "https://boese.example" })).status).toBe(403);
    await raw("POST", "/admin/logout", { cookie });
    expect((await raw("GET", "/admin/me", { cookie })).status).toBe(401);
  });
});

describe("Abmeldung nach Inaktivität", () => {
  it("Sitzung läuft ohne Anfragen ab, jede Anfrage verlängert sie", async () => {
    const { adminSession } = await import("../src/db/schema.ts");
    const cookie = await adminCookie();
    const [s1] = await db.select().from(adminSession);
    const minutes = (d: Date) => (d.getTime() - Date.now()) / 60_000;
    expect(minutes(s1!.expiresAt)).toBeGreaterThan(10.5);
    expect(minutes(s1!.expiresAt)).toBeLessThanOrEqual(11);

    // 11 Minuten ohne Aktivität simulieren → abgelaufen
    await db.update(adminSession).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await raw("GET", "/admin/me", { cookie })).status).toBe(401);

    // neue Sitzung: kurz vor Ablauf eine Anfrage → wieder ~11 Minuten
    const cookie2 = await adminCookie();
    await db.update(adminSession).set({ expiresAt: new Date(Date.now() + 30_000) });
    expect((await raw("GET", "/admin/me", { cookie: cookie2 })).status).toBe(200);
    const [s2] = await db.select().from(adminSession).where(gt(adminSession.expiresAt, new Date()));
    expect(minutes(s2!.expiresAt)).toBeGreaterThan(10.5);
  });

  it("höchstens 12 Stunden nach der Anmeldung, auch bei Aktivität", async () => {
    const { adminSession } = await import("../src/db/schema.ts");
    const cookie = await adminCookie();
    await db.update(adminSession).set({ createdAt: new Date(Date.now() - 12 * 3600_000 + 60_000) });
    await raw("GET", "/admin/me", { cookie });
    const [s] = await db.select().from(adminSession);
    expect((s!.expiresAt.getTime() - Date.now()) / 60_000).toBeLessThanOrEqual(1);
  });
});

describe("Admin-Verwaltung", () => {
  it("Übersicht und Benutzerliste", async () => {
    const stats = (await admin("GET", "/stats")).body;
    expect(stats).toMatchObject({ users: 2, groups: 1, childProfiles: 0 });
    const users = (await admin("GET", "/users")).body;
    expect(users.map((u: any) => u.name)).toEqual(["Anna", "Ben"]);
    expect(users[0].groups).toEqual([{ id: g, name: "Familie", role: "admin" }]);
  });

  it("enthält nirgends Reservierungsdaten", async () => {
    const w = (await call(anna, "POST", `/profiles/${annaP}/wishes`, { title: "Uhr" })).body;
    await call(ben, "POST", `/wishes/${w.id}/reserve`);
    for (const path of ["/stats", "/users", "/groups", "/children", "/events", "/shares", "/invites"]) {
      expect(JSON.stringify((await admin("GET", path)).body).toLowerCase()).not.toContain("reserv");
    }
  });

  it("Benutzer bearbeiten (Name überträgt sich aufs Profil) und Passwort setzen", async () => {
    expect((await admin("PATCH", `/users/${ben.id}`, { name: "Benjamin", emailVerified: true })).status).toBe(200);
    expect((await call(anna, "GET", `/groups/${g}`)).body.members.map((m: any) => m.displayName)).toContain("Benjamin");
    expect((await admin("PATCH", `/users/${ben.id}`, { email: anna.email })).status).toBe(400);

    expect((await admin("POST", `/users/${ben.id}/password`, { password: "neues-passwort-1" })).status).toBe(200);
    expect((await call(ben, "GET", "/me")).status).toBe(401); // alte Sitzung beendet
    await expect(signIn(ben.email, "neues-passwort-1")).resolves.toContain("=");
  });

  it("Benutzer löschen: Profil und Wünsche weg, Reservierungen frei", async () => {
    const w = (await call(anna, "POST", `/profiles/${annaP}/wishes`, { title: "Uhr" })).body;
    const benP = (await call(ben, "GET", "/me")).body.profile.id;
    const bw = (await call(ben, "POST", `/profiles/${benP}/wishes`, { title: "Bens Wunsch" })).body;
    await call(ben, "POST", `/wishes/${w.id}/reserve`);
    expect((await admin("DELETE", `/users/${ben.id}`)).status).toBe(200);
    expect((await db.select().from(wish).where(eq(wish.id, bw.id))).length).toBe(0);
    expect((await call(anna, "GET", `/groups/${g}`)).body.members.map((m: any) => m.displayName)).toEqual(["Anna"]);
    const fresh = await createUser("Cara");
    const inv = await call(anna, "POST", `/groups/${g}/invites`, {});
    await call(fresh, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
    expect((await call(fresh, "GET", `/profiles/${annaP}/list`)).body.wishes[0].reservation).toBe("available");
  });

  it("Gruppen: Mitglied hinzufügen, Rolle ändern, entfernen, löschen", async () => {
    const cara = await createUser("Cara");
    const caraP = (await call(cara, "GET", "/me")).body.profile.id;
    expect((await admin("PUT", `/groups/${g}/members/${caraP}`, { role: "member" })).status).toBe(200);
    expect((await call(cara, "GET", "/groups")).body.map((x: any) => x.name)).toEqual(["Familie"]);
    await admin("PUT", `/groups/${g}/members/${caraP}`, { role: "admin" });
    expect((await call(cara, "GET", `/groups/${g}`)).body.myRole).toBe("admin");
    await admin("DELETE", `/groups/${g}/members/${caraP}`);
    expect((await call(cara, "GET", "/groups")).body).toEqual([]);
    await admin("DELETE", `/groups/${g}`);
    expect((await admin("GET", "/groups")).body).toEqual([]);
  });

  it("Kinderprofile: Verwalter zuordnen und entfernen", async () => {
    const kind = (await call(anna, "POST", "/children", { displayName: "Emil" })).body.id;
    expect((await admin("POST", `/children/${kind}/guardians`, { userId: ben.id })).status).toBe(200);
    expect((await call(ben, "GET", "/me")).body.managedProfiles.map((p: any) => p.displayName)).toEqual(["Emil"]);
    await admin("DELETE", `/children/${kind}/guardians/${anna.id}`);
    expect((await admin("GET", "/children")).body[0].guardians.map((x: any) => x.name)).toEqual(["Ben"]);
    await admin("DELETE", `/children/${kind}`);
    expect((await admin("GET", "/children")).body).toEqual([]);
  });

  it("Events, Einladungen und Teilen-Links verwalten", async () => {
    const e = (await call(anna, "POST", `/groups/${g}/events`, { type: "secret_santa", name: "Wichteln" })).body.id;
    await call(anna, "POST", `/events/${e}/draw`).catch(() => {});
    expect((await admin("GET", "/events")).body[0]).toMatchObject({ name: "Wichteln", groupName: "Familie" });
    expect(JSON.stringify((await admin("GET", "/events")).body)).not.toContain("receiver");
    await admin("DELETE", `/events/${e}`);
    expect((await admin("GET", "/events")).body).toEqual([]);

    const s = (await call(anna, "POST", `/profiles/${annaP}/shares`, { label: "Pate" })).body;
    expect((await admin("GET", "/shares")).body[0]).toMatchObject({ label: "Pate", profileName: "Anna" });
    await admin("DELETE", `/shares/${s.id}`);
    expect((await admin("GET", "/shares")).body).toEqual([]);

    const invites = (await admin("GET", "/invites")).body;
    expect(invites.length).toBeGreaterThan(0);
    await admin("DELETE", `/invites/${invites[0].id}`);
    expect((await admin("GET", "/invites")).body.length).toBe(invites.length - 1);
  });
});
