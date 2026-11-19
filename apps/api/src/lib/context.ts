import { HTTPException } from "hono/http-exception";
import type { AuthSession, AuthUser } from "../auth.ts";

export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    session: AuthSession | null;
  };
};

/** Erzwingt eine Anmeldung und gibt den Benutzer zurück. */
export function requireUser(c: { get: (key: "user") => AuthUser | null }): AuthUser {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Nicht angemeldet" });
  return user;
}
