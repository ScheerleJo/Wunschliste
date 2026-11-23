import { inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import { notification, user } from "../db/schema.ts";
import { env } from "../env.ts";
import { linkMail, sendMail } from "../mail.ts";

export interface NotifyInput {
  title: string;
  body: string;
  /** App-interner Pfad, z. B. /events/123 */
  linkPath?: string;
  linkLabel?: string;
}

/**
 * Benachrichtigung in der App anlegen und zusätzlich per Mail schicken.
 * Mailfehler werden nur protokolliert: Die eigentliche Aktion (z. B. ein Gruppenbeitritt) soll daran nicht scheitern.
 */
export async function notify(userIds: string[], input: NotifyInput) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.insert(notification).values(
    ids.map((userId) => ({
      userId,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath ?? null,
      linkLabel: input.linkLabel ?? null,
    })),
  );
  const recipients = await db.select({ email: user.email }).from(user).where(inArray(user.id, ids));
  await Promise.all(
    recipients.map((r) =>
      sendMail(
        input.linkPath
          ? linkMail(r.email, input.title, input.body, input.linkLabel ?? "Öffnen", `${env.appUrl}${input.linkPath}`)
          : { to: r.email, subject: input.title, text: input.body },
      ).catch(() => {}),
    ),
  );
}
