/**
 * Admin-Konten verwalten (nur auf dem Server, nie über die Webseite):
 *
 *   pnpm admin create  admin@example.com     Admin anlegen (fragt nach dem Passwort)
 *   pnpm admin password admin@example.com    Passwort ändern (meldet alle Sitzungen ab)
 *   pnpm admin delete  admin@example.com     Admin löschen
 *   pnpm admin list                          Alle Admins anzeigen
 *
 * Im Docker-Container: docker compose exec app pnpm admin create admin@example.com
 * Das Passwort kann für Skripte auch über die Umgebungsvariable ADMIN_PASSWORD kommen.
 */
import { createInterface } from "node:readline";
import { eq } from "drizzle-orm";
import { db, sqlClient } from "./db/index.ts";
import { runMigrations } from "./db/migrate.ts";
import { adminAccount, adminSession } from "./db/schema.ts";
import { hashPassword, MIN_ADMIN_PASSWORD } from "./services/admin-auth.ts";

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Eingabe nicht anzeigen
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

async function readPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const pw = await ask("Neues Passwort: ", true);
  const again = await ask("Passwort wiederholen: ", true);
  if (pw !== again) throw new Error("Die Passwörter stimmen nicht überein.");
  return pw;
}

async function main() {
  const [cmd, rawEmail] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  await runMigrations();

  switch (cmd) {
    case "create": {
      if (!email?.includes("@")) throw new Error("Aufruf: pnpm admin create admin@example.com");
      const [exists] = await db.select().from(adminAccount).where(eq(adminAccount.email, email));
      if (exists) throw new Error(`Admin ${email} gibt es schon. Zum Ändern: pnpm admin password ${email}`);
      const pw = await readPassword();
      if (pw.length < MIN_ADMIN_PASSWORD) throw new Error(`Das Passwort muss mindestens ${MIN_ADMIN_PASSWORD} Zeichen lang sein.`);
      await db.insert(adminAccount).values({ email, passwordHash: await hashPassword(pw) });
      console.log(`✅ Admin ${email} angelegt. Anmeldung unter <APP_URL>/admin`);
      break;
    }
    case "password": {
      const [admin] = email ? await db.select().from(adminAccount).where(eq(adminAccount.email, email)) : [];
      if (!admin) throw new Error(`Admin ${email ?? ""} nicht gefunden.`);
      const pw = await readPassword();
      if (pw.length < MIN_ADMIN_PASSWORD) throw new Error(`Das Passwort muss mindestens ${MIN_ADMIN_PASSWORD} Zeichen lang sein.`);
      await db.update(adminAccount).set({ passwordHash: await hashPassword(pw) }).where(eq(adminAccount.id, admin.id));
      await db.delete(adminSession).where(eq(adminSession.adminId, admin.id));
      console.log(`✅ Passwort für ${email} geändert, alle Sitzungen abgemeldet.`);
      break;
    }
    case "delete": {
      const deleted = email ? await db.delete(adminAccount).where(eq(adminAccount.email, email)).returning() : [];
      console.log(deleted.length ? `✅ Admin ${email} gelöscht.` : `Admin ${email ?? ""} nicht gefunden.`);
      break;
    }
    case "list": {
      const admins = await db.select().from(adminAccount);
      if (admins.length === 0) console.log("Noch kein Admin. Anlegen mit: pnpm admin create admin@example.com");
      for (const a of admins) console.log(`- ${a.email}  (letzte Anmeldung: ${a.lastLoginAt?.toLocaleString("de-DE") ?? "nie"})`);
      break;
    }
    default:
      console.log("Befehle: create <email> | password <email> | delete <email> | list");
  }
}

main()
  .catch((e) => {
    console.error(`❌ ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
