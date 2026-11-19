import nodemailer from "nodemailer";
import { APP_NAME } from "@wunschliste/shared";
import { env } from "./env.ts";

// TODO: Echten SMTP-Server konfigurieren. Bis dahin fängt Mailpit alle Mails ab
// bzw. sie werden ohne SMTP_HOST nur in der Konsole ausgegeben.
const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(mail: Mail) {
  if (!transport) {
    console.log(`\n[Mail an ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return;
  }
  await transport.sendMail({ from: env.mailFrom, ...mail });
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
