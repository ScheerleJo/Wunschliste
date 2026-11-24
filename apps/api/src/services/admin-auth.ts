/**
 * Anmeldung für System-Admins. Bewusst getrennt von Better Auth und den normalen Konten:
 *  - Admin-Konten entstehen nur per Kommandozeile (pnpm admin create …), nie über die Webseite
 *  - Passwörter als scrypt-Hash, Sitzungs-Token nur als SHA-256-Hash in der Datenbank
 *  - Cookie nur für /api/admin, HttpOnly, SameSite=Strict, Secure (bei https)
 *  - Abmeldung nach Inaktivität: Jede Anfrage verlängert die Sitzung auf IDLE_MINUTES, höchstens bis SESSION_HOURS
 *    nach der Anmeldung. Die Oberfläche zeigt einen 10-Minuten-Countdown; der Server gibt 1 Minute Puffer dazu.
 *  - Sperre nach zu vielen Fehlversuchen, Herkunftsprüfung (Origin) für ändernde Anfragen
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../db/index.ts";
import { adminAccount, adminSession } from "../db/schema.ts";
import { env } from "../env.ts";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "wb_admin";
const SESSION_HOURS = 12;
/** Inaktivität bis zur Abmeldung (Anzeige im Browser: 10 Minuten, Server: 1 Minute Puffer) */
export const ADMIN_IDLE_MINUTES = 11;
const idleExpiry = (createdAt: Date) =>
  new Date(Math.min(Date.now() + ADMIN_IDLE_MINUTES * 60_000, createdAt.getTime() + SESSION_HOURS * 3600_000));
export const MIN_ADMIN_PASSWORD = 12;

// ---- Passwörter ----------------------------------------------------------------

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Zum Angleichen der Antwortzeit, wenn es die E-Mail-Adresse gar nicht gibt */
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

// ---- Sperre nach Fehlversuchen (pro IP und pro E-Mail) -------------------------------

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const fails = new Map<string, { count: number; until: number }>();

export function clientIp(c: Context): string {
  for (const h of env.ipHeaders) {
    const v = c.req.header(h);
    if (v) return v.split(",")[0]!.trim();
  }
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? "unbekannt";
}

function isLocked(key: string) {
  const f = fails.get(key);
  return !!f && f.count >= MAX_FAILS && f.until > Date.now();
}
function registerFail(key: string) {
  const f = fails.get(key);
  const fresh = !f || f.until < Date.now();
  fails.set(key, { count: fresh ? 1 : f.count + 1, until: Date.now() + LOCK_MINUTES * 60_000 });
}

/** Nur für Tests */
export function resetAdminLoginLimits() {
  fails.clear();
}

// ---- Anmeldung & Sitzung ---------------------------------------------------------------

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function adminLogin(c: Context, email: string, password: string) {
  const keys = [`ip:${clientIp(c)}`, `mail:${email.toLowerCase()}`];
  if (keys.some(isLocked)) {
    throw new HTTPException(429, { message: `Zu viele Fehlversuche. Bitte in ${LOCK_MINUTES} Minuten erneut versuchen.` });
  }
  const [admin] = await db.select().from(adminAccount).where(eq(adminAccount.email, email.toLowerCase()));
  const ok = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok) {
    keys.forEach(registerFail);
    throw new HTTPException(401, { message: "E-Mail oder Passwort ist falsch" });
  }
  keys.forEach((k) => fails.delete(k));

  const token = randomBytes(32).toString("base64url");
  await db.delete(adminSession).where(lt(adminSession.expiresAt, new Date())); // aufräumen
  await db.insert(adminSession).values({
    adminId: admin.id,
    tokenHash: sha(token),
    expiresAt: idleExpiry(new Date()),
  });
  await db.update(adminAccount).set({ lastLoginAt: new Date() }).where(eq(adminAccount.id, admin.id));
  setCookie(c, COOKIE, token, {
    path: "/api/admin",
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "Strict",
    maxAge: SESSION_HOURS * 3600,
  });
  return { id: admin.id, email: admin.email };
}

export async function adminLogout(c: Context) {
  const token = getCookie(c, COOKIE);
  if (token) await db.delete(adminSession).where(eq(adminSession.tokenHash, sha(token)));
  deleteCookie(c, COOKIE, { path: "/api/admin" });
}

export type AdminEnv = { Variables: { admin: { id: string; email: string } } };

/** Schützt alle Admin-Routen: gültige Admin-Sitzung + passende Herkunft bei ändernden Anfragen */
export const requireAdminSession = createMiddleware<AdminEnv>(async (c, next) => {
  if (c.req.method !== "GET") {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(env.appUrl).origin) throw new HTTPException(403, { message: "Ungültige Herkunft" });
  }
  const token = getCookie(c, COOKIE);
  if (!token) throw new HTTPException(401, { message: "Nicht als Admin angemeldet" });
  const [row] = await db
    .select({ id: adminAccount.id, email: adminAccount.email, sessionId: adminSession.id, createdAt: adminSession.createdAt })
    .from(adminSession)
    .innerJoin(adminAccount, eq(adminAccount.id, adminSession.adminId))
    .where(and(eq(adminSession.tokenHash, sha(token)), gt(adminSession.expiresAt, new Date())));
  if (!row) throw new HTTPException(401, { message: "Admin-Sitzung abgelaufen" });
  // Aktivität verlängert die Sitzung (gleitendes Ablaufdatum)
  await db.update(adminSession).set({ expiresAt: idleExpiry(row.createdAt) }).where(eq(adminSession.id, row.sessionId));
  c.set("admin", { id: row.id, email: row.email });
  await next();
});
