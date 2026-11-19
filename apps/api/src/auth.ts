import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APP_NAME } from "@wunschliste/shared";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "./db/index.ts";
import { account, profile, session, user, verification } from "./db/schema.ts";
import { env } from "./env.ts";
import { linkMail, sendMail } from "./mail.ts";
import { loadInvite } from "./services/invites.ts";
import { loadHandover } from "./services/handover.ts";

/** Header, mit dem der Client den Einladungs-Token bei der Registrierung mitschickt */
export const INVITE_HEADER = "x-invite-token";
/** Header für die Registrierung über einen Übergabelink (Kinderprofil) */
export const HANDOVER_HEADER = "x-handover-token";

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env.appUrl,
  basePath: "/api/auth",
  secret: env.authSecret,
  trustedOrigins: [env.appUrl],
  telemetry: { enabled: false },
  advanced: env.ipHeaders.length > 0 ? { ipAddress: { ipAddressHeaders: env.ipHeaders } } : undefined,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 Tage angemeldet bleiben
    updateAge: 60 * 60 * 24,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Registrierung nur mit gültigem Einladungslink (siehe hooks.before), außer beim allerersten Konto.
    // E-Mail muss bestätigt sein. Sonst würde Better Auth beim ersten Magic-Link-Login
    // das Passwort entfernen (Schutz gegen Konto-Übernahme mit fremder Adresse).
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        linkMail(
          user.email,
          "Passwort zurücksetzen",
          `Hallo ${user.name}, du kannst hier ein neues Passwort für deine Wunschliste festlegen.`,
          "Neues Passwort festlegen",
          url,
        ),
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(
        linkMail(
          user.email,
          "Bitte bestätige deine E-Mail-Adresse",
          `Hallo ${user.name}, willkommen bei „${APP_NAME}“! Bitte bestätige noch kurz deine E-Mail-Adresse.`,
          "E-Mail bestätigen",
          url,
        ),
      );
    },
  },
  plugins: [
    magicLink({
      // Magic Link nur zum Anmelden, neue Konten entstehen ausschließlich über Einladungen.
      disableSignUp: true,
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        // Unbekannte Adressen bekommen keine Mail (Antwort an den Client bleibt gleich).
        const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase()));
        if (!existing) return;
        await sendMail(
          linkMail(email, "Dein Anmeldelink", `Hier ist dein Link zur Anmeldung bei „${APP_NAME}“. Er ist 15 Minuten gültig.`, "Jetzt anmelden", url),
        );
      },
    }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const [anyUser] = await db.select({ id: user.id }).from(user).limit(1);
      if (!anyUser) return; // Ersteinrichtung: das erste Konto braucht keine Einladung

      const email = String((ctx.body as { email?: string } | undefined)?.email ?? "").toLowerCase();

      // Übergabe eines Kinderprofils: gilt wie eine Einladung, aber nur für die hinterlegte Adresse
      const handoverToken = ctx.headers?.get(HANDOVER_HEADER);
      if (handoverToken) {
        const h = await loadHandover(handoverToken);
        if (h?.valid && h.h.email === email) return;
        throw new APIError("FORBIDDEN", {
          code: h?.valid ? "HANDOVER_EMAIL_MISMATCH" : "INVITE_REQUIRED",
          message: h?.valid ? "Diese Übergabe gilt für eine andere E-Mail-Adresse" : "Der Übergabelink ist nicht mehr gültig",
        });
      }

      const token = ctx.headers?.get(INVITE_HEADER);
      const inv = token ? await loadInvite(token) : null;
      if (!inv?.valid) {
        throw new APIError("FORBIDDEN", {
          code: "INVITE_REQUIRED",
          message: "Registrierung nur mit gültiger Einladung möglich",
        });
      }
      if (inv.invite.email && inv.invite.email !== email) {
        throw new APIError("FORBIDDEN", {
          code: "INVITE_EMAIL_MISMATCH",
          message: "Diese Einladung gilt für eine andere E-Mail-Adresse",
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Jeder neue Benutzer bekommt automatisch sein eigenes Profil (= eigene Wunschliste).
        after: async (created) => {
          await db.insert(profile).values({ displayName: created.name, userId: created.id }).onConflictDoNothing();
        },
      },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
