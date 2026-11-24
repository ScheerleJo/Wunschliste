# Wunschbaum 🎄

*Wünschen, schenken, pssst.*

Wunschlisten-App für Familien: Jede Person hat eine Wunschliste, die über Gruppen geteilt wird.
Wünsche können reserviert werden, ohne dass der Wünschende es sieht. Dazu gibt es Events wie
Wichteln mit Budget und Ausschlüssen.

## Dokumentation

| Dokument | Für wen |
|---|---|
| [docs/BENUTZERHANDBUCH.md](docs/BENUTZERHANDBUCH.md) | Kurzanleitung für die Familie: Wünsche, Reservieren, Kinder, Wichteln |
| [docs/KONZEPT.md](docs/KONZEPT.md) | Fachliche Regeln und Entscheidungen (Sichtbarkeit, Kinderprofile, Wichteln …) |
| [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md) | Architektur, Code-Struktur, API-Übersicht, Tests |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Betrieb auf Proxmox mit Docker, Cloudflare und Nginx Proxy Manager, Backups |

## Funktionen

- Konten mit E-Mail und Passwort oder Anmeldelink per Mail; Registrierung nur über Einladungen
- Gruppen (z. B. eigene Familie, Schwiegerfamilie) mit Admins, Einladungslinks und Mail-Einladungen
- Wunschlisten mit Beschreibung, Preis, Links und Bildern/Screenshots; Archiv; Sichtbarkeit pro Gruppe
- Reservieren, ohne dass der Wünschende es sieht; Übersicht „Meine Reservierungen“ mit Änderungshinweisen
- Kinderprofile, von beiden Eltern verwaltet und später an ein eigenes Konto übergebbar
- Events mit Budget; Wichteln mit Auslosung, Haushalten, Ausschlüssen, Vorjahres-Regel und Notfall-Einsicht

Der App-Name steht zentral in `packages/shared/src/index.ts` (`APP_NAME`). Die Paketnamen `@wunschliste/*`
und die Datenbank heißen intern weiterhin `wunschliste`.

## Aufbau

```
apps/api        Node.js + Hono (REST-API), Drizzle ORM (PostgreSQL), Better Auth
apps/web        React + Vite, TanStack Query, React Router, Tailwind
packages/shared Gemeinsame Typen und Zod-Validierung (Web, API, später Mobile-App)
```

## Lokal entwickeln

Voraussetzungen: Node.js ≥ 22.12, pnpm (`npm install -g pnpm@10`), Docker (unter Windows: Docker Desktop) und
der **Font Awesome Package Token** als Umgebungsvariable `FONTAWESOME_PACKAGE_TOKEN`, weil die Icons aus Font Awesome Pro
kommen. Der Token steht in deinem Konto auf fontawesome.com unter *Package Tokens*. Unter Windows einmalig
`setx FONTAWESOME_PACKAGE_TOKEN "dein-token"` und danach ein neues Terminal öffnen. Ohne Token schlägt `pnpm install` fehl.

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
| `pnpm admin create admin@example.com` | Admin-Konto für `/admin` anlegen (auch `password`, `list`, `delete`) |
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
