import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "./db/index.ts";
import { account, profile, session, user, verification } from "./db/schema.ts";
import { env } from "./env.ts";
import { linkMail, sendMail } from "./mail.ts";

export const auth = betterAuth({
  appName: "Wunschliste",
  baseURL: env.appUrl,
  basePath: "/api/auth",
  secret: env.authSecret,
  trustedOrigins: [env.appUrl],
  telemetry: { enabled: false },
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
    // TODO (Gruppen-Schritt): Registrierung nur mit gültigem Einladungslink erlauben.
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
          `Hallo ${user.name}, willkommen bei der Wunschliste! Bitte bestätige noch kurz deine E-Mail-Adresse.`,
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
          linkMail(email, "Dein Anmeldelink", "Hier ist dein Link zur Anmeldung bei der Wunschliste. Er ist 15 Minuten gültig.", "Jetzt anmelden", url),
        );
      },
    }),
  ],
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
