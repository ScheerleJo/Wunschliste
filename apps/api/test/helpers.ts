import { app } from "../src/app.ts";
import { auth } from "../src/auth.ts";
import { db } from "../src/db/index.ts";
import { user } from "../src/db/schema.ts";
import { sql } from "drizzle-orm";

export const PASSWORD = "test-passwort-123";
let counter = 0;

/** Löscht alle Daten (zwischen Tests). */
export async function resetDb() {
  await db.execute(sql`TRUNCATE "user", "group", profile, verification RESTART IDENTITY CASCADE`);
}

/** Legt einen bestätigten Benutzer direkt an (ohne Einladung) und meldet ihn an. */
export async function createUser(name: string) {
  const ctx = await auth.$context;
  const email = `${name.toLowerCase()}-${++counter}@example.com`;
  const created = await ctx.internalAdapter.createUser({ name, email, emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(PASSWORD),
  });
  const cookie = await signIn(email);
  return { id: created.id, name, email, cookie };
}

export async function signIn(email: string, password = PASSWORD) {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (!res.ok) throw new Error(`Login fehlgeschlagen: ${res.status} ${await res.text()}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

export type TestUser = Awaited<ReturnType<typeof createUser>>;

/** API-Aufruf als bestimmter Benutzer (oder anonym) */
export async function call<T = any>(who: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      ...(who ? { Cookie: who.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as T;
  return { status: res.status, body: json };
}

export async function userCount() {
  return (await db.select().from(user)).length;
}

/** Datei-Upload als bestimmter Benutzer */
export async function upload(who: TestUser, path: string, data: Buffer, filename = "bild.jpg", type = "image/jpeg") {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(data)], filename, { type }));
  const res = await app.request(`/api${path}`, {
    method: "POST",
    headers: { Origin: "http://localhost:5173", Cookie: who.cookie },
    body: form,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

/** Rohdaten abrufen (z. B. Bilder) */
export async function fetchRaw(who: TestUser | null, path: string) {
  const res = await app.request(`/api${path}`, { headers: who ? { Cookie: who.cookie } : {} });
  return { status: res.status, headers: res.headers, data: Buffer.from(await res.arrayBuffer()) };
}
