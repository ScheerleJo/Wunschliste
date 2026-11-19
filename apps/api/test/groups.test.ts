import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { call, createUser, resetDb, type TestUser } from "./helpers.ts";

let anna: TestUser, ben: TestUser, cara: TestUser;

beforeEach(async () => {
  await resetDb();
  anna = await createUser("Anna");
  ben = await createUser("Ben");
  cara = await createUser("Cara");
});

async function createGroup(owner: TestUser, name = "Familie Müller") {
  const res = await call<{ id: string }>(owner, "POST", "/groups", { name });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function inviteAndJoin(admin: TestUser, groupId: string, joiner: TestUser) {
  const inv = await call(admin, "POST", `/groups/${groupId}/invites`, {});
  const token = inv.body.url.split("/").pop();
  const res = await call(joiner, "POST", `/invites/${token}/accept`);
  expect(res.status).toBe(200);
  return token as string;
}

describe("Gruppen", () => {
  it("Ersteller wird Admin, Gruppe erscheint in der Liste", async () => {
    const id = await createGroup(anna);
    const list = await call(anna, "GET", "/groups");
    expect(list.body).toEqual([expect.objectContaining({ id, myRole: "admin", memberCount: 1 })]);
  });

  it("Fremde sehen die Gruppe nicht (404)", async () => {
    const id = await createGroup(anna);
    expect((await call(ben, "GET", `/groups/${id}`)).status).toBe(404);
    expect((await call(null, "GET", `/groups/${id}`)).status).toBe(401);
  });

  it("Beitritt per Einladungslink", async () => {
    const id = await createGroup(anna);
    await inviteAndJoin(anna, id, ben);
    const detail = await call(ben, "GET", `/groups/${id}`);
    expect(detail.body.myRole).toBe("member");
    expect(detail.body.members.map((m: any) => m.displayName)).toEqual(["Anna", "Ben"]);
  });

  it("Nur Admins dürfen einladen, umbenennen und Mitglieder entfernen", async () => {
    const id = await createGroup(anna);
    await inviteAndJoin(anna, id, ben);
    await inviteAndJoin(anna, id, cara);
    expect((await call(ben, "POST", `/groups/${id}/invites`, {})).status).toBe(403);
    expect((await call(ben, "PATCH", `/groups/${id}`, { name: "Neu" })).status).toBe(403);
    const caraProfile = (await call(cara, "GET", "/me")).body.profile.id;
    expect((await call(ben, "DELETE", `/groups/${id}/members/${caraProfile}`)).status).toBe(403);
    expect((await call(anna, "DELETE", `/groups/${id}/members/${caraProfile}`)).status).toBe(200);
  });

  it("Der letzte Admin kann weder austreten noch herabgestuft werden", async () => {
    const id = await createGroup(anna);
    await inviteAndJoin(anna, id, ben);
    const annaProfile = (await call(anna, "GET", "/me")).body.profile.id;
    const benProfile = (await call(ben, "GET", "/me")).body.profile.id;
    expect((await call(anna, "DELETE", `/groups/${id}/members/${annaProfile}`)).status).toBe(400);
    expect((await call(anna, "PATCH", `/groups/${id}/members/${annaProfile}`, { role: "member" })).status).toBe(400);
    // Ben zum Admin machen, dann darf Anna gehen
    expect((await call(anna, "PATCH", `/groups/${id}/members/${benProfile}`, { role: "admin" })).status).toBe(200);
    expect((await call(anna, "DELETE", `/groups/${id}/members/${annaProfile}`)).status).toBe(200);
    expect((await call(anna, "GET", `/groups/${id}`)).status).toBe(404);
  });

  it("Letztes Mitglied tritt aus: Gruppe wird aufgelöst", async () => {
    const id = await createGroup(anna);
    const annaProfile = (await call(anna, "GET", "/me")).body.profile.id;
    const res = await call(anna, "DELETE", `/groups/${id}/members/${annaProfile}`);
    expect(res.body.groupDeleted).toBe(true);
    expect((await call(anna, "GET", "/groups")).body).toEqual([]);
  });
});

describe("Einladungen", () => {
  it("Vorschau ohne Anmeldung, inkl. Gruppenname und Einladender", async () => {
    const id = await createGroup(anna, "Familie Schmidt");
    const inv = await call(anna, "POST", `/groups/${id}/invites`, {});
    const token = inv.body.url.split("/").pop();
    const preview = await call(null, "GET", `/invites/${token}`);
    expect(preview.body).toMatchObject({ groupName: "Familie Schmidt", invitedByName: "Anna", valid: true });
  });

  it("Zurückgezogene Einladungen funktionieren nicht mehr", async () => {
    const id = await createGroup(anna);
    const inv = await call(anna, "POST", `/groups/${id}/invites`, {});
    await call(anna, "DELETE", `/groups/${id}/invites/${inv.body.id}`);
    const token = inv.body.url.split("/").pop();
    expect((await call(null, "GET", `/invites/${token}`)).body.reason).toBe("revoked");
    expect((await call(ben, "POST", `/invites/${token}/accept`)).status).toBe(400);
  });

  it("Nutzungslimit wird eingehalten", async () => {
    const id = await createGroup(anna);
    const inv = await call(anna, "POST", `/groups/${id}/invites`, { maxUses: 1 });
    const token = inv.body.url.split("/").pop();
    expect((await call(ben, "POST", `/invites/${token}/accept`)).status).toBe(200);
    expect((await call(cara, "POST", `/invites/${token}/accept`)).status).toBe(400);
  });

  it("Mail-Einladung gilt nur für die eingeladene Adresse", async () => {
    const id = await createGroup(anna);
    const inv = await call(anna, "POST", `/groups/${id}/invites`, { email: ben.email });
    const token = inv.body.url.split("/").pop();
    expect((await call(cara, "POST", `/invites/${token}/accept`)).status).toBe(403);
    expect((await call(ben, "POST", `/invites/${token}/accept`)).status).toBe(200);
  });
});

describe("Registrierung nur mit Einladung", () => {
  async function signUp(email: string, token?: string) {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        ...(token ? { "x-invite-token": token } : {}),
      },
      body: JSON.stringify({ name: "Neu", email, password: "sicheres-passwort" }),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  it("ohne Einladung abgelehnt", async () => {
    const res = await signUp("neu@example.com");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("INVITE_REQUIRED");
  });

  it("mit gültiger Einladung erlaubt", async () => {
    const id = await createGroup(anna);
    const inv = await call(anna, "POST", `/groups/${id}/invites`, {});
    const res = await signUp("neu@example.com", inv.body.url.split("/").pop());
    expect(res.status).toBe(200);
  });

  it("Mail-Einladung nur mit passender Adresse", async () => {
    const id = await createGroup(anna);
    const inv = await call(anna, "POST", `/groups/${id}/invites`, { email: "oma@example.com" });
    const token = inv.body.url.split("/").pop();
    expect((await signUp("jemand@example.com", token)).body.code).toBe("INVITE_EMAIL_MISMATCH");
    expect((await signUp("Oma@example.com", token)).status).toBe(200);
  });
});
