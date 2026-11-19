import nodemailer from "nodemailer";
import { APP_NAME } from "@wunschliste/shared";
import { env } from "./env.ts";

// Ohne SMTP_HOST werden Mails nur in der Konsole ausgegeben (z. B. für Tests).
const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465, // 465 = TLS sofort, 587 = STARTTLS
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

const emailOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/**
 * Absenderadresse. Viele Anbieter (z. B. IONOS, GMX, Gmail) erlauben als Absender nur die Adresse,
 * mit der man sich anmeldet. Ist MAIL_FROM nicht gesetzt, wird deshalb SMTP_USER verwendet.
 */
export const mailFrom: string = (() => {
  const from = env.mailFrom;
  if (from) return from.includes("<") ? from : `${APP_NAME} <${from}>`;
  if (env.smtp.user?.includes("@")) return `${APP_NAME} <${env.smtp.user}>`;
  return `${APP_NAME} <wunschbaum@localhost>`;
})();

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Übersetzt typische SMTP-Fehler in einen konkreten Hinweis, was in der .env zu ändern ist. */
export function explainMailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; command?: string; message?: string };
  const text = `${e.response ?? ""} ${e.message ?? ""}`.toLowerCase();
  const from = emailOf(mailFrom);

  if (e.command === "MAIL FROM" || /mx|sender|absender|from address|not owned|not allowed to send/.test(text)) {
    return (
      `Der Mailserver lehnt den Absender „${from}“ ab. ` +
      (domainOf(from) === "localhost"
        ? "MAIL_FROM ist nicht gesetzt. Trage in der .env z. B. MAIL_FROM=\"Wunschbaum <deine-adresse@domain.de>\" ein (am besten die Adresse aus SMTP_USER)."
        : "Setze MAIL_FROM auf die Adresse deines Postfachs (meist identisch mit SMTP_USER). Die meisten Anbieter erlauben nur diese Adresse " +
          "(oder einen dort eingerichteten Alias), und die Domain der Absenderadresse muss einen MX-Eintrag im DNS haben.")
    );
  }
  if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534) {
    return "Anmeldung am Mailserver fehlgeschlagen: SMTP_USER oder SMTP_PASS stimmen nicht. Bei Gmail ist ein App-Passwort nötig, nicht das normale Passwort.";
  }
  if (e.command === "RCPT TO") {
    return "Der Mailserver lehnt die Empfängeradresse ab. Gibt es die Adresse wirklich?";
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS"].includes(e.code ?? "")) {
    return `Keine Verbindung zu ${env.smtp.host}:${env.smtp.port}. Prüfe SMTP_HOST und SMTP_PORT (meist 587, sonst 465) und ob der Server ausgehende Verbindungen auf diesem Port erlaubt.`;
  }
  if (/certificate|self.signed|tls|ssl/.test(text)) {
    return `TLS-Problem mit ${env.smtp.host}:${env.smtp.port}. Probiere den jeweils anderen Port (587 bzw. 465).`;
  }
  return `Unbekannter Mailfehler: ${e.response ?? e.message ?? String(err)}`;
}

export async function sendMail(mail: Mail) {
  if (!transport) {
    console.log(`\n[Mail an ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return;
  }
  try {
    await transport.sendMail({ from: mailFrom, ...mail });
  } catch (err) {
    console.error(`\n✉️  Mail an ${mail.to} („${mail.subject}“) nicht verschickt.\n   ${explainMailError(err)}\n`);
    throw err;
  }
}

/** Beim Start: Mailkonfiguration prüfen und verständlich melden (bricht den Start nicht ab). */
export async function checkMailSetup() {
  if (!transport) {
    console.log("✉️  Kein SMTP_HOST gesetzt: Mails werden nur in der Konsole ausgegeben.");
    return;
  }
  const from = emailOf(mailFrom);
  const warnings: string[] = [];
  if (domainOf(from) === "localhost") warnings.push("MAIL_FROM ist nicht gesetzt und SMTP_USER ist keine Mail-Adresse.");
  if (env.smtp.user?.includes("@") && domainOf(env.smtp.user) !== domainOf(from)) {
    warnings.push(`Absender (${from}) und Login (${env.smtp.user}) haben verschiedene Domains. Viele Anbieter lehnen das ab.`);
  }
  try {
    await transport.verify();
    console.log(`✉️  Mailserver ${env.smtp.host}:${env.smtp.port} erreichbar, Absender: ${mailFrom}`);
  } catch (err) {
    console.error(`✉️  Mailserver-Prüfung fehlgeschlagen: ${explainMailError(err)}`);
  }
  for (const w of warnings) console.warn(`✉️  Hinweis: ${w}`);
}

/** Einfache Mail mit einem Button-Link */
export function linkMail(to: string, subject: string, intro: string, buttonText: string, url: string): Mail {
  return {
    to,
    subject,
    text: `${intro}\n\n${buttonText}: ${url}\n\nWenn du das nicht angefordert hast, kannst du diese Mail ignorieren.\n\n${APP_NAME}`,
    html: `<p>${intro}</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#b91c1c;color:#fff;border-radius:8px;text-decoration:none">${buttonText}</a></p>
<p style="color:#666;font-size:13px">Falls der Button nicht funktioniert: ${url}<br>Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren.</p>
<p style="color:#999;font-size:12px">🎄 ${APP_NAME}</p>`,
  };
}
