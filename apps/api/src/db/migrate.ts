import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "./index.ts";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}

// Direkt aufgerufen (pnpm db:migrate): migrieren und beenden
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runMigrations();
  console.log("Migrationen angewendet.");
  await sqlClient.end();
}
