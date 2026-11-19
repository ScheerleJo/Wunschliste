import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../src/app.ts";
import { db } from "../src/db/index.ts";
import { profileHandover } from "../src/db/schema.ts";
import { call, createUser, resetDb, type TestUser } from "./helpers.ts";

let mama: TestUser, papa: TestUser, oma: TestUser, fremd: TestUser;
let familie: string;

async function join(admin: TestUser, groupId: string, u: TestUser) {
  const inv = await call(admin, "POST", `/groups/${groupId}/invites`, {});
  await call(u, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
}
async function newChild(name = "Emil") {
  return (await call(mama, "POST", "/children", { displayName: name })).body.id as string;
}
async function handoverToken(childId: string, email: string) {
  await call(mama, "POST", `/children/${childId}/handover`, { email });
  const [h] = await db.select().from(profileHandover).where(eq(profileHandover.profileId, childId));
  return h!.token;
}

beforeEach(async () => {
  await resetDb();
  mama = await createUser("Mama");
  papa = await createUser("Papa");
  oma = await createUser("Oma");
  fremd = await createUser("Fremd");
  familie = (await call(mama, "POST", "/groups", { name: "Familie" })).body.id;
  await join(mama, familie, papa);
  await join(mama, familie, oma);
});

describe("Kinderprofile", () => {
  it("anlegen: erscheint in /me und die Liste ist verwaltbar", async () => {
    const id = await newChild();
    expect((await call(mama, "GET", "/me")).body.managedProfiles).toEqual([{ id, displayName: "Emil", managed: true }]);
    expect((await call(mama, "POST", `/profiles/${id}/wishes`, { title: "Bagger" })).status).toBe(201);
  });

  it("Fremde haben keinen Zugriff", async () => {
    const id = await newChild();
    expect((await call(fremd, "GET", `/children/${id}`)).status).toBe(404);
    expect((await call(fremd, "POST", `/profiles/${id}/wishes`, { title: "X" })).status).toBe(404);
    expect((await call(oma, "DELETE", `/children/${id}`)).status).toBe(404);
  });

  it("zweiter Elternteil: nur aus gemeinsamen Gruppen, danach voller Zugriff", async () => {
    const id = await newChild();
    const candidates = (await call(mama, "GET", `/children/${id}/guardian-candidates`)).body.map((p: any) => p.name);
    expect(candidates.sort()).toEqual(["Oma", "Papa"]);
    expect((await call(mama, "POST", `/children/${id}/guardians`, { userId: fremd.id })).status).toBe(400);
    expect((await call(mama, "POST", `/children/${id}/guardians`, { userId: papa.id })).status).toBe(200);
    expect((await call(papa, "POST", `/profiles/${id}/wishes`, { title: "Roller" })).status).toBe(201);
    expect((await call(papa, "GET", `/children/${id}`)).body.guardians.map((g: any) => g.name)).toEqual(["Mama", "Papa"]);
  });

  it("die letzte verwaltende Person kann nicht entfernt werden", async () => {
    const id = await newChild();
    expect((await call(mama, "DELETE", `/children/${id}/guardians/${mama.id}`)).status).toBe(400);
    await call(mama, "POST", `/children/${id}/guardians`, { userId: papa.id });
    expect((await call(mama, "DELETE", `/children/${id}/guardians/${mama.id}`)).status).toBe(200);
    expect((await call(mama, "GET", `/children/${id}`)).status).toBe(404);
  });

  it("in Gruppen aufnehmen: nur eigene Gruppen; danach sehen Mitglieder die Liste", async () => {
    const id = await newChild();
    const fremdeGruppe = (await call(fremd, "POST", "/groups", { name: "Andere" })).body.id;
    expect((await call(mama, "POST", `/children/${id}/groups`, { groupId: fremdeGruppe })).status).toBe(403);
    expect((await call(mama, "POST", `/children/${id}/groups`, { groupId: familie })).status).toBe(200);
    await call(mama, "POST", `/profiles/${id}/wishes`, { title: "Bagger" });
    expect((await call(oma, "GET", `/profiles/${id}/list`)).body.wishes.map((w: any) => w.title)).toEqual(["Bagger"]);
    const members = (await call(mama, "GET", `/groups/${familie}`)).body.members;
    expect(members.find((m: any) => m.displayName === "Emil")).toMatchObject({ managed: true, managedByMe: true });
    expect((await call(oma, "GET", `/groups/${familie}`)).body.members.find((m: any) => m.displayName === "Emil").managedByMe).toBe(false);
  });

  it("Kinder können keine Gruppen-Admins werden", async () => {
    const id = await newChild();
    await call(mama, "POST", `/children/${id}/groups`, { groupId: familie });
    expect((await call(mama, "PATCH", `/groups/${familie}/members/${id}`, { role: "admin" })).status).toBe(400);
  });

  it("Gruppe wird aufgelöst, wenn nur noch Kinder übrig wären", async () => {
    const solo = (await call(fremd, "POST", "/groups", { name: "Solo" })).body.id;
    const kind = (await call(fremd, "POST", "/children", { displayName: "Kind" })).body.id;
    await call(fremd, "POST", `/children/${kind}/groups`, { groupId: solo });
    const fremdP = (await call(fremd, "GET", "/me")).body.profile.id;
    expect((await call(fremd, "DELETE", `/groups/${solo}/members/${fremdP}`)).body.groupDeleted).toBe(true);
  });

  it("löschen entfernt Profil und Wünsche", async () => {
    const id = await newChild();
    await call(mama, "POST", `/profiles/${id}/wishes`, { title: "Bagger" });
    expect((await call(mama, "DELETE", `/children/${id}`)).status).toBe(200);
    expect((await call(mama, "GET", "/me")).body.managedProfiles).toEqual([]);
  });
});

describe("Übergabe an ein eigenes Konto", () => {
  async function signUp(email: string, headers: Record<string, string>) {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...headers },
      body: JSON.stringify({ name: "Emil", email, password: "sicheres-passwort" }),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  it("Registrierung mit Übergabelink nur für die hinterlegte Adresse", async () => {
    const id = await newChild();
    const token = await handoverToken(id, "emil@example.com");
    expect((await signUp("jemand@example.com", { "x-handover-token": token })).status).toBe(403);
    expect((await signUp("emil@example.com", { "x-handover-token": token })).status).toBe(200);
  });

  it("Übernahme: Liste, Bilder-Wünsche und Gruppen bleiben, Eltern verlieren Zugriff, Reservierungen werden unsichtbar", async () => {
    const id = await newChild();
    await call(mama, "POST", `/children/${id}/groups`, { groupId: familie });
    const w = (await call(mama, "POST", `/profiles/${id}/wishes`, { title: "Bagger" })).body;
    await call(oma, "POST", `/wishes/${w.id}/reserve`);
    // Mama sieht als Elternteil den Status
    expect((await call(mama, "GET", `/profiles/${id}/list`)).body.wishes[0].reservation).toBe("reserved");

    const token = await handoverToken(id, "emil@example.com");
    expect((await call(null, "GET", `/handover/${token}`)).body).toMatchObject({ childName: "Emil", valid: true, wishCount: 1 });

    const emil = await createUser("Emil", "emil@example.com");
    expect((await call(fremd, "POST", `/handover/${token}/accept`)).status).toBe(403);
    expect((await call(emil, "POST", `/handover/${token}/accept`)).status).toBe(200);

    const me = (await call(emil, "GET", "/me")).body;
    expect(me.profile).toMatchObject({ id, displayName: "Emil", managed: false });
    const own = (await call(emil, "GET", `/profiles/${id}/wishes`)).body;
    expect(own.map((x: any) => x.title)).toEqual(["Bagger"]);
    expect(JSON.stringify(own).toLowerCase()).not.toContain("reserv");
    expect((await call(emil, "GET", "/groups")).body.map((g: any) => g.name)).toEqual(["Familie"]);

    // Eltern: keine Verwaltung mehr, aber wie alle anderen Schenkende
    expect((await call(mama, "GET", `/children/${id}`)).status).toBe(404);
    expect((await call(mama, "POST", `/profiles/${id}/wishes`, { title: "X" })).status).toBe(404);
    expect((await call(mama, "GET", "/me")).body.managedProfiles).toEqual([]);
    expect((await call(mama, "GET", `/profiles/${id}/list`)).body.wishes[0].reservation).toBe("reserved");
    // Omas Reservierung bleibt bestehen
    expect((await call(oma, "GET", "/reservations")).body[0]).toMatchObject({ title: "Bagger", state: "ok" });
    // Link ist danach verbraucht
    expect((await call(null, "GET", `/handover/${token}`)).body.valid).toBe(false);
  });

  it("bestehendes Konto: eigene Wünsche und Gruppen werden zusammengeführt", async () => {
    const id = await newChild();
    const emil = await createUser("Emil", "emil@example.com");
    const emilP = (await call(emil, "GET", "/me")).body.profile.id;
    const eigene = (await call(emil, "POST", "/groups", { name: "Freunde" })).body.id;
    await call(emil, "POST", `/profiles/${emilP}/wishes`, { title: "Skateboard", visibleInAllGroups: false, groupIds: [eigene] });
    await call(mama, "POST", `/profiles/${id}/wishes`, { title: "Bagger" });

    const token = await handoverToken(id, "emil@example.com");
    expect((await call(emil, "POST", `/handover/${token}/accept`)).status).toBe(200);
    const me = (await call(emil, "GET", "/me")).body;
    expect(me.profile.id).toBe(id);
    expect((await call(emil, "GET", `/profiles/${id}/wishes`)).body.map((x: any) => x.title).sort()).toEqual(["Bagger", "Skateboard"]);
    expect((await call(emil, "GET", "/groups")).body).toEqual([expect.objectContaining({ name: "Freunde", myRole: "admin" })]);
  });

  it("neuer Link macht den alten ungültig; Abbrechen möglich", async () => {
    const id = await newChild();
    const t1 = await handoverToken(id, "emil@example.com");
    await call(mama, "POST", `/children/${id}/handover`, { email: "emil@example.com" });
    expect((await call(null, "GET", `/handover/${t1}`)).body.valid).toBe(false);
    expect((await call(mama, "GET", `/children/${id}`)).body.pendingHandover.email).toBe("emil@example.com");
    await call(mama, "DELETE", `/children/${id}/handover`);
    expect((await call(mama, "GET", `/children/${id}`)).body.pendingHandover).toBeNull();
  });
});
