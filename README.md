# Wunschbaum 🎄

*Wünschen, schenken, pssst.*

Wunschlisten-App für Familien: Jede Person hat eine Wunschliste, die über Gruppen geteilt wird.
Wünsche können reserviert werden, ohne dass der Wünschende es sieht. Dazu gibt es Events wie
Wichteln mit Budget und Ausschlüssen.

Konzept, Entscheidungen und Fahrplan: [docs/KONZEPT.md](docs/KONZEPT.md)

Der App-Name steht zentral in `packages/shared/src/index.ts` (`APP_NAME`). Die Paketnamen `@wunschliste/*`
und die Datenbank heißen intern weiterhin `wunschliste`.

## Aufbau

```
apps/api        Node.js + Hono (REST-API), Drizzle ORM (PostgreSQL), Better Auth
apps/web        React + Vite, TanStack Query, React Router, Tailwind
packages/shared Gemeinsame Typen und Zod-Validierung (Web, API, später Mobile-App)
```

## Lokal entwickeln

Voraussetzungen: Node.js ≥ 22.12, pnpm (`npm install -g pnpm@10`), Docker (unter Windows: Docker Desktop).

```bash
cp .env.example .env                              # Windows: copy .env.example .env
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL + Mailpit
pnpm install
pnpm dev                                          # API :3000, Web :5173
```

- App: http://localhost:5173
- Abgefangene Mails (Bestätigung, Magic Link, Passwort-Reset): http://localhost:8025

Migrationen werden beim Start der API automatisch angewendet.

**Erstes Konto:** Solange es noch kein Konto gibt, kann man sich unter `/registrieren` ohne Einladung registrieren.
Danach geht das nur noch über Einladungslinks aus einer Gruppe.

**Fehler `http proxy error … ECONNREFUSED` im Web-Terminal:** Die API (Port 3000) läuft nicht.
Die Ursache steht weiter oben in den Zeilen `apps/api dev:`, meistens ist die Datenbank nicht erreichbar
(Docker Desktop nicht gestartet bzw. `docker compose -f docker-compose.dev.yml up -d` vergessen).

| Befehl | Zweck |
|---|---|
| `pnpm dev` | API und Web mit Hot Reload |
| `pnpm typecheck` | TypeScript-Prüfung aller Pakete |
| `pnpm test` | Tests (die API-Tests legen dafür die Datenbank `wunschliste_test` an, PostgreSQL muss laufen) |
| `pnpm db:generate` | Nach Änderungen an `apps/api/src/db/schema.ts` eine Migration erzeugen |
| `pnpm build` | Web-App für Produktion bauen |
| `pnpm mail:test adresse@example.com` | Testmail mit der Mailkonfiguration aus der `.env` schicken; erklärt Fehler |

## Produktion (Proxmox)

Schritt-für-Schritt-Anleitung (LXC, Docker, Cloudflare, Nginx Proxy Manager, Backups):
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

Kurzfassung:

```bash
cp .env.example .env      # APP_URL, BETTER_AUTH_SECRET, POSTGRES_PASSWORD, SMTP_* setzen
docker compose up -d --build
sh scripts/backup.sh      # Sicherung von Datenbank und Bildern
```
