import { Hono } from "hono";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { NotificationListDto } from "@wunschliste/shared";
import { db } from "../db/index.ts";
import { notification } from "../db/schema.ts";
import { requireUser, type AppEnv } from "../lib/context.ts";

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get("/notifications", async (c) => {
  const u = requireUser(c);
  const [items, [unread]] = await Promise.all([
    db.select().from(notification).where(eq(notification.userId, u.id)).orderBy(desc(notification.createdAt)).limit(50),
    db
      .select({ n: count() })
      .from(notification)
      .where(and(eq(notification.userId, u.id), isNull(notification.readAt))),
  ]);
  const body: NotificationListDto = {
    unread: unread?.n ?? 0,
    items: items.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      linkPath: n.linkPath,
      linkLabel: n.linkLabel,
      createdAt: n.createdAt.toISOString(),
      read: n.readAt !== null,
    })),
  };
  return c.json(body);
});

notificationRoutes.post("/notifications/:id/read", async (c) => {
  const u = requireUser(c);
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.id, c.req.param("id")), eq(notification.userId, u.id), isNull(notification.readAt)));
  return c.json({ ok: true });
});

notificationRoutes.post("/notifications/read-all", async (c) => {
  const u = requireUser(c);
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, u.id), isNull(notification.readAt)));
  return c.json({ ok: true });
});
