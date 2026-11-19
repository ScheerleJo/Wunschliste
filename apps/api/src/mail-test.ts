/**
 * Testmail verschicken: pnpm mail:test empfaenger@example.com
 * Zeigt die Mailkonfiguration (ohne Passwort) und erklärt Fehler.
 */
import { APP_NAME } from "@wunschliste/shared";
import { env } from "./env.ts";
import { checkMailSetup, mailFrom, sendMail } from "./mail.ts";

const to = process.argv[2];
if (!to?.includes("@")) {
  console.error("Aufruf: pnpm mail:test empfaenger@example.com");
  process.exit(1);
}

console.log("Mailkonfiguration:");
console.log(`  SMTP_HOST  ${env.smtp.host ?? "(leer, nur Konsole)"}`);
console.log(`  SMTP_PORT  ${env.smtp.port}`);
console.log(`  SMTP_USER  ${env.smtp.user ?? "(leer)"}`);
console.log(`  SMTP_PASS  ${env.smtp.pass ? "(gesetzt)" : "(leer)"}`);
const source = env.mailFrom ? "aus MAIL_FROM" : env.smtp.user?.includes("@") ? "aus SMTP_USER, da MAIL_FROM leer ist" : "Platzhalter, MAIL_FROM ist leer";
console.log(`  Absender   ${mailFrom}  (${source})\n`);

await checkMailSetup();
try {
  await sendMail({
    to,
    subject: `Testmail von ${APP_NAME}`,
    text: `Hallo! Wenn du das liest, funktioniert der Mailversand von ${APP_NAME}. 🎄`,
    html: `<p>Hallo! Wenn du das liest, funktioniert der Mailversand von <b>${APP_NAME}</b>. 🎄</p>`,
  });
  console.log(`\n✅ Testmail an ${to} verschickt. Schau auch im Spam-Ordner nach.`);
} catch {
  console.error("❌ Testmail nicht verschickt (Grund siehe oben).");
  process.exit(1);
}
