# Wunschliste

Wunschlisten-App für Familien: Jede Person hat eine Wunschliste, die über Gruppen geteilt wird.
Wünsche können reserviert werden, ohne dass der Wünschende es sieht. Dazu gibt es Events wie
Wichteln mit Budget und Ausschlüssen.

Konzept, Entscheidungen und Fahrplan: [docs/KONZEPT.md](docs/KONZEPT.md)

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

**Fehler `http proxy error … ECONNREFUSED` im Web-Terminal:** Die API (Port 3000) läuft nicht.
Die Ursache steht weiter oben in den Zeilen `apps/api dev:`, meistens ist die Datenbank nicht erreichbar
(Docker Desktop nicht gestartet bzw. `docker compose -f docker-compose.dev.yml up -d` vergessen).

| Befehl | Zweck |
|---|---|
| `pnpm dev` | API und Web mit Hot Reload |
| `pnpm typecheck` | TypeScript-Prüfung aller Pakete |
| `pnpm test` | Tests |
| `pnpm db:generate` | Nach Änderungen an `apps/api/src/db/schema.ts` eine Migration erzeugen |
| `pnpm build` | Web-App für Produktion bauen |

## Produktion (Proxmox)

In einer LXC oder VM mit Docker:

```bash
cp .env.example .env   # APP_URL=https://wunschliste.basislager.cloud, BETTER_AUTH_SECRET setzen, POSTGRES_PASSWORD setzen
docker compose up -d --build
```

Im Nginx Proxy Manager einen Proxy Host `wunschliste.basislager.cloud` → `<IP der VM>:3000` mit SSL anlegen.
Die API liefert in Produktion auch die Web-App aus, es ist also nur ein Container nach außen nötig.
