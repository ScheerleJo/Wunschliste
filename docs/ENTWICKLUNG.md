# Entwicklung

Überblick über Architektur und Code, damit du dich schnell zurechtfindest.
Fachliche Regeln: [KONZEPT.md](KONZEPT.md) · Betrieb: [DEPLOYMENT.md](DEPLOYMENT.md)

## Architektur

```
Browser ──▶ apps/web (React, Vite)  ──/api──▶  apps/api (Hono, Node.js) ──▶ PostgreSQL
                    │                                   │                    Bilder: UPLOAD_DIR
                    └──── packages/shared (Typen, Zod-Schemas, Hilfsfunktionen) ────┘
```

- **Entwicklung:** Vite (Port 5173) leitet `/api` an die API (Port 3000) weiter.
- **Produktion:** Ein Container. Die API liefert auch die gebaute Web-App aus (`apps/web/dist`).
- **Später eine App:** Eine native App (z. B. Expo/React Native) kann dieselbe API und `packages/shared` nutzen.

## Technik

| Bereich | Bibliothek |
|---|---|
| API-Framework | [Hono](https://hono.dev) auf `@hono/node-server` |
| Datenbank | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) (Schema in TypeScript, Migrationen mit drizzle-kit) |
| Anmeldung | [Better Auth](https://www.better-auth.com): E-Mail/Passwort, Magic Link, Mail-Bestätigung, Sessions per Cookie |
| Validierung | [Zod](https://zod.dev), geteilt zwischen API und Web |
| Bilder | [sharp](https://sharp.pixelplumbing.com) |
| Mails | nodemailer |
| Web | React 19, React Router, TanStack Query, Tailwind CSS 4 |
| Tests | Vitest gegen eine echte Test-Datenbank |

## Ordnerstruktur

```
apps/api/
  src/
    index.ts            Startpunkt: Migrationen, Mail-Check, Server, Auslieferung der Web-App
    app.ts              Hono-App: Session-Middleware, /me, Einbindung aller Routen, Fehlerbehandlung
    auth.ts             Better Auth: Registrierung nur mit Einladung/Übergabe, Mails, Magic Link
    env.ts              Umgebungsvariablen
    mail.ts             Mailversand, Fehlererklärungen, Prüfung beim Start
    mail-test.ts        pnpm mail:test
    db/schema.ts        ★ komplettes Datenbankschema
    db/migrate.ts       Migrationen anwenden
    lib/                Hilfen (context.ts: requireUser, http.ts: parseJson & Fehler)
    services/
      visibility.ts     ★ zentrale Sichtbarkeitsregeln für fremde Wunschlisten
      access.ts         Wer darf welche Liste verwalten (eigene + verwaltete Kinder)
      draw.ts           ★ Wichtel-Algorithmus (reine Funktion)
      images.ts         Bildverarbeitung und -ablage
      event-membership.ts  Neues Gruppenmitglied: laufende Events ergänzen oder Organisatoren benachrichtigen
      notifications.ts     Benachrichtigung in der App + Mail
      groups.ts, invites.ts, profiles.ts, handover.ts
    routes/             eine Datei pro Fachbereich
  drizzle/              generierte SQL-Migrationen (nicht von Hand ändern)
  test/                 Integrationstests (pro Bereich eine Datei)

apps/web/src/
  main.tsx              Router, Login-Schutz
  lib/api.ts            ★ typisierter API-Client (alle Endpunkte)
  lib/auth-client.ts    Better-Auth-Client, deutsche Fehlermeldungen
  pages/                eine Datei pro Seite
  components/           wiederverwendbare Bausteine (ui.tsx: Button, Card, Field, …)

packages/shared/src/index.ts   APP_NAME, Zod-Schemas, DTO-Typen, Preis-/Budget-Formatierung
```

## Wichtige Konzepte im Code

- **Profil ≠ Benutzer:** Wünsche, Gruppenmitgliedschaften und Wichtel-Teilnahmen hängen an einem **Profil**.
  Jeder Benutzer hat genau ein eigenes Profil (`profile.userId`). Kinderprofile haben `userId = null` und werden über
  `profile_guardian` verwaltet. Reservierungen hängen am **Benutzer** (`reservedByUserId`).
- **Zwei Sichten auf Wünsche:**
  - *Besitzer-Sicht* (`GET /profiles/:id/wishes`, `OwnWishDto`) enthält **nie** Reservierungsdaten.
  - *Schenkenden-Sicht* (`GET /profiles/:id/list`, `ViewWishDto`) zeigt den Status, aber nie, wer reserviert hat.
    Für das eigene Profil liefert sie 404.
- **404 statt 403**, wenn etwas für jemanden nicht existieren soll (fremde Gruppen, Listen, Bilder).
  So lässt sich nichts erraten.
- **Soft-Delete:** Ist ein Wunsch reserviert, wird er beim Löschen nur als `deleted` markiert, damit der Reservierende
  einen Hinweis bekommt. Die Antwort an den Besitzer ist identisch.
- **„Geändert“-Hinweis:** `wish.updatedAt` > `reservation.createdAt` bzw. `acknowledgedAt`. Umsortieren und Archivieren
  setzen `updatedAt` bewusst nicht neu.

## API-Übersicht

Alle Endpunkte liegen unter `/api` und brauchen (außer Auth, Health und Vorschauen) eine Session.

| Bereich | Endpunkte |
|---|---|
| Auth | `/auth/*` (Better Auth: `sign-up/email`, `sign-in/email`, `sign-in/magic-link`, `request-password-reset`, …) |
| Allgemein | `GET /health`, `GET /me`, `GET /registration-status` |
| Gruppen | `GET/POST /groups`, `GET/PATCH/DELETE /groups/:id`, `PATCH/DELETE /groups/:id/members/:profileId` |
| Einladungen | `GET/POST /groups/:id/invites`, `DELETE /groups/:id/invites/:inviteId`, `GET /invites/:token`, `POST /invites/:token/accept` |
| Wünsche (Besitzer) | `GET/POST /profiles/:id/wishes`, `PUT /profiles/:id/wishes/order`, `GET /profiles/:id/groups`, `PATCH/DELETE /wishes/:id`, `POST /wishes/:id/archive`, `POST /wishes/:id/restore` |
| Bilder | `POST /wishes/:id/images` (multipart, Feld `file`), `DELETE /wishes/:id/images/:imageId`, `GET /images/:id`, `GET /images/:id/thumb` |
| Reservierungen | `GET /profiles/:id/list`, `POST/DELETE /wishes/:id/reserve`, `GET /reservations`, `POST /reservations/:wishId/acknowledge` |
| Kinder | `POST /children`, `GET/PATCH/DELETE /children/:id`, `…/guardians`, `…/guardian-candidates`, `…/groups`, `…/handover`, `GET /handover/:token`, `POST /handover/:token/accept` |
| Haushalte | `GET/POST /groups/:id/households`, `PUT/DELETE /households/:id` |
| Teilen (Besitzer) | `GET/POST /profiles/:id/shares`, `DELETE /shares/:id` |
| Teilen (Gäste, ohne Login) | `GET /share/:token`, `POST/DELETE /share/:token/wishes/:wishId/reserve`, `POST /share/:token/reservations/:wishId/acknowledge`, `GET /share/:token/images/:id[/thumb]` (Identität = Link-Token) |
| Benachrichtigungen | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Admin | `POST /admin/login`, `POST /admin/logout`, `GET /admin/me`, `GET /admin/stats`, `/admin/users[/:id[/password\|/logout]]`, `/admin/groups[/:id[/members/:profileId]]`, `/admin/children[/:id[/guardians[/:userId]]]`, `/admin/events/:id`, `/admin/invites/:id`, `/admin/shares/:id`. Eigene Sitzung (`services/admin-auth.ts`), Konten per `pnpm admin` (`src/admin-cli.ts`) |
| Events | `GET /events`, `POST /groups/:id/events`, `GET/PATCH/DELETE /events/:id`, `PUT /events/:id/type`, `PUT /events/:id/participants`, `PUT /events/:id/exclusions`, `POST /events/:id/draw`, `POST /events/:id/reset`, `POST /events/:id/reveal` |

Request- und Response-Typen stehen in `packages/shared/src/index.ts`, der passende Client in `apps/web/src/lib/api.ts`.

## Typische Aufgaben

**Datenbank ändern**
1. `apps/api/src/db/schema.ts` anpassen.
2. `pnpm db:generate --name kurze_beschreibung`: erzeugt eine SQL-Migration in `apps/api/drizzle/`.
3. SQL kurz prüfen und mitcommitten. Beim nächsten Start der API wird sie automatisch angewendet.

**Neuen Endpunkt bauen**
1. Bei Bedarf Schema und DTO in `packages/shared` ergänzen.
2. Route in der passenden Datei unter `apps/api/src/routes/` anlegen: `requireUser(c)`, Berechtigung prüfen,
   Eingaben mit `parseJson(c, schema)` validieren.
3. Test in `apps/api/test/` schreiben.
4. Funktion im Web-Client `apps/web/src/lib/api.ts` ergänzen und in einer Seite mit TanStack Query nutzen.

**App umbenennen:** `APP_NAME` in `packages/shared/src/index.ts`.

**Icon ändern:** Alle Icons kommen über `<Icon name="…" />` aus `apps/web/src/components/Icon.tsx`
(Font Awesome Pro, selbst gehostet; zum Installieren ist `FONTAWESOME_PACKAGE_TOKEN` nötig, siehe `.npmrc`). Dort steht jede Bedeutung, z. B. `edit` oder `reserve`, genau einmal.
Ein anderes Icon = eine Zeile ändern. Übersicht der Bedeutungen: `docs/ICONS.md`.

## Tests

```bash
pnpm test        # legt die Datenbank "wunschliste_test" neu an (PostgreSQL muss laufen)
pnpm typecheck
```

- 107 Integrationstests decken vor allem die Sicherheitsregeln ab: Wer sieht was, wer darf was,
  Geheimhaltung von Reservierungen und Wichtel-Zuordnungen.
- `test/helpers.ts` bietet `createUser`, `call(user, method, path, body)`, `upload` und `fetchRaw`.
- Die Tests laufen nacheinander und leeren die Datenbank vor jedem Test (`resetDb`).

## Konventionen

- Oberfläche, Fehlermeldungen und Kommentare auf **Deutsch**.
- Imports innerhalb der API mit Endung `.ts` (läuft direkt mit `tsx`, ohne Build-Schritt).
- Keine Geheimnisse im Code. Alles Konfigurierbare steht in `.env`, dokumentiert in `.env.example`.
