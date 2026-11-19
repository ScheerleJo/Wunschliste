import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { and, eq, isNull } from "drizzle-orm";
import type { MeDto } from "@wunschliste/shared";
import { auth, type AuthSession, type AuthUser } from "./auth.ts";
import { db } from "./db/index.ts";
import { profile, profileGuardian } from "./db/schema.ts";

export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    session: AuthSession | null;
  };
};

/** Lädt die Session (falls vorhanden) für alle API-Routen. */
const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});

/** Erzwingt eine Anmeldung und gibt den Benutzer zurück. */
export function requireUser(c: { get: (key: "user") => AuthUser | null }): AuthUser {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Nicht angemeldet" });
  return user;
}

export const app = new Hono<AppEnv>().basePath("/api");

app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => c.json({ ok: true }));

app.use("*", sessionMiddleware);

app.get("/me", async (c) => {
  const user = requireUser(c);

  let [own] = await db.select().from(profile).where(eq(profile.userId, user.id));
  if (!own) {
    // Sicherheitsnetz, falls der Hook beim Registrieren nicht gegriffen hat
    [own] = await db.insert(profile).values({ displayName: user.name, userId: user.id }).returning();
  }

  const managed = await db
    .select({ id: profile.id, displayName: profile.displayName })
    .from(profileGuardian)
    .innerJoin(profile, eq(profile.id, profileGuardian.profileId))
    .where(and(eq(profileGuardian.guardianUserId, user.id), isNull(profile.userId)));

  const body: MeDto = {
    user: { id: user.id, name: user.name, email: user.email },
    profile: { id: own!.id, displayName: own!.displayName, managed: false },
    managedProfiles: managed.map((p) => ({ ...p, managed: true })),
  };
  return c.json(body);
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Interner Fehler" }, 500);
});
