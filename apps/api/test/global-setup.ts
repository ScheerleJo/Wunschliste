// Legt vor den Tests eine frische Test-Datenbank an und spielt die Migrationen ein.
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

export default async function setup() {
  const base = process.env.DATABASE_URL ?? "postgres://wunschliste:wunschliste@localhost:5432/wunschliste";
  const adminUrl = base.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
  const testUrl = base.replace(/\/[^/?]+(\?|$)/, "/wunschliste_test$1");

  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe("DROP DATABASE IF EXISTS wunschliste_test WITH (FORCE)");
  await admin.unsafe("CREATE DATABASE wunschliste_test");
  await admin.end();

  const client = postgres(testUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  await client.end();
}
