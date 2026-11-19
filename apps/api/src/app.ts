import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { and, eq, isNull } from "drizzle-orm";
import type { MeDto } from "@wunschliste/shared";
import { auth } from "./auth.ts";
import { db } from "./db/index.ts";
import { profile, profileGuardian } from "./db/schema.ts";
import { requireUser, type AppEnv } from "./lib/context.ts";
import { groupRoutes } from "./routes/groups.ts";
import { inviteRoutes } from "./routes/invites.ts";
import { wishRoutes } from "./routes/wishes.ts";
import { reservationRoutes } from "./routes/reservations.ts";
import { getOwnProfile } from "./services/profiles.ts";

/** Lädt die Session (falls vorhanden) für alle API-Routen. */
const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});

export const app = new Hono<AppEnv>().basePath("/api");

app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => c.json({ ok: true }));

app.use("*", sessionMiddleware);

app.get("/me", async (c) => {
  const user = requireUser(c);

  const own = await getOwnProfile(user);

  const managed = await db
    .select({ id: profile.id, displayName: profile.displayName })
    .from(profileGuardian)
    .innerJoin(profile, eq(profile.id, profileGuardian.profileId))
    .where(and(eq(profileGuardian.guardianUserId, user.id), isNull(profile.userId)));

  const body: MeDto = {
    user: { id: user.id, name: user.name, email: user.email },
    profile: { id: own.id, displayName: own.displayName, managed: false },
    managedProfiles: managed.map((p) => ({ ...p, managed: true })),
  };
  return c.json(body);
});

app.route("/groups", groupRoutes);
app.route("/", inviteRoutes);
app.route("/", wishRoutes);
app.route("/", reservationRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Interner Fehler" }, 500);
});
