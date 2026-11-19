import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient()],
});

/** Übersetzt die häufigsten Fehlercodes von Better Auth ins Deutsche. */
export function authErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-Mail oder Passwort ist falsch.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Für diese E-Mail-Adresse gibt es bereits ein Konto.";
    case "PASSWORD_TOO_SHORT":
      return "Das Passwort ist zu kurz.";
    case "EMAIL_NOT_VERIFIED":
      return "Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir gerade einen neuen Bestätigungslink geschickt.";
    case "INVITE_REQUIRED":
      return "Die Registrierung ist nur mit einer gültigen Einladung möglich.";
    case "INVITE_EMAIL_MISMATCH":
      return "Diese Einladung gilt für eine andere E-Mail-Adresse.";
    case "HANDOVER_EMAIL_MISMATCH":
      return "Diese Übergabe gilt für eine andere E-Mail-Adresse.";
    case "INVALID_TOKEN":
      return "Der Link ist ungültig oder abgelaufen.";
    default:
      return error?.message ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
  }
}

/** Nur interne Pfade als Weiterleitungsziel zulassen (kein Open Redirect). */
export function safeRedirect(target: string | null | undefined, fallback = "/"): string {
  return target && target.startsWith("/") && !target.startsWith("//") ? target : fallback;
}
