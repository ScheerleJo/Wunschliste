# Wunschbaum auf Proxmox betreiben

Ziel: `https://wunschbaum.basislager.cloud`. Der Weg dorthin:
Cloudflare → Nginx Proxy Manager → Docker-Container in einem LXC auf Proxmox.

```
Internet ─▶ Cloudflare ─▶ Router ─▶ Nginx Proxy Manager ─▶ LXC "wunschbaum" :3000
                                                             ├─ app (API + Web)
                                                             └─ db  (PostgreSQL)
```

---

## 1. LXC-Container in Proxmox anlegen

**Create CT** mit diesen Einstellungen:

| Einstellung | Wert |
|---|---|
| Template | Debian 12 (Bookworm) |
| Unprivileged container | ✅ ja |
| Hostname | `wunschbaum` |
| Disk | 16 GB |
| CPU | 2 Cores |
| Memory | 2048 MB (Swap 512 MB) |
| Netzwerk | feste IP im Heimnetz, z. B. `192.168.1.50/24` |

Danach unter **Options → Features** die Häkchen **nesting** und **keyctl** setzen.
Ohne sie läuft Docker im LXC nicht. Dann den Container starten.

> Alternativ geht auch eine VM (Debian 12). Das ist etwas schwerer, aber Docker läuft dort ohne LXC-Features.

## 2. Docker installieren

In der Konsole des Containers (als root):

```bash
apt update && apt -y upgrade
apt -y install ca-certificates curl git
curl -fsSL https://get.docker.com | sh
docker run --rm hello-world     # Test: sollte "Hello from Docker!" zeigen
```

## 3. Code holen

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/scheerlejo/wunschliste.git wunschbaum
cd wunschbaum
git checkout claude/wishlist-app-groups-2zttyn   # bis der Code in main gemergt ist
```

Ist das Repository privat, fragt Git nach Benutzername und Passwort. Als Passwort brauchst du ein
**GitHub Personal Access Token** (GitHub → Settings → Developer settings → Fine-grained tokens,
nur Lesezugriff auf dieses eine Repository).

## 4. Konfiguration (`.env`)

```bash
cp .env.example .env
nano .env
```

Mindestens diese Werte setzen:

```bash
APP_URL=https://wunschbaum.basislager.cloud
BETTER_AUTH_SECRET=...        # erzeugen mit: openssl rand -base64 32
POSTGRES_PASSWORD=...         # erzeugen mit: openssl rand -hex 24
APP_PORT=3000
IP_HEADERS=cf-connecting-ip   # weil Cloudflare davor sitzt

SMTP_HOST=smtp.ionos.de
SMTP_PORT=587
SMTP_USER=postfach@deine-domain.de
SMTP_PASS=...
MAIL_FROM="Wunschbaum <postfach@deine-domain.de>"
```

`DATABASE_URL` und `UPLOAD_DIR` setzt die `docker-compose.yml` selbst, die Zeilen aus der Vorlage werden ignoriert.

> **Wichtig:** `APP_URL` muss exakt die Adresse sein, unter der die App aufgerufen wird (mit `https://`,
> ohne `/` am Ende). Sonst schlägt die Anmeldung fehl („Invalid origin“).

## 5. Starten

```bash
docker compose up -d --build     # der erste Build dauert ein paar Minuten
docker compose ps                # app und db sollten "healthy" sein
docker compose logs -f app       # Strg+C beendet nur die Anzeige
```

In den Logs sollte stehen:

```
Wunschbaum-API läuft auf http://localhost:3000
✉️  Mailserver smtp.ionos.de:587 erreichbar, Absender: Wunschbaum <…>
```

Mailversand testen:

```bash
docker compose exec app pnpm mail:test deine-adresse@example.com
```

## 6. Cloudflare

Unter **DNS → Records**:

| Typ | Name | Inhalt | Proxy |
|---|---|---|---|
| A | `wunschbaum` | deine öffentliche IP | 🟠 Proxied |

Falls du für andere Dienste schon einen DynDNS-Namen nutzt, kannst du stattdessen einen
**CNAME** `wunschbaum` → `dein-dyndns-name` anlegen.

Unter **SSL/TLS → Overview** den Modus **Full (strict)** wählen.
Dafür braucht der Nginx Proxy Manager ein gültiges Zertifikat (Schritt 7).

## 7. Nginx Proxy Manager

**Hosts → Proxy Hosts → Add Proxy Host**

*Details:*
- Domain Names: `wunschbaum.basislager.cloud`
- Scheme: `http`
- Forward Hostname / IP: IP des LXC, z. B. `192.168.1.50`
- Forward Port: `3000`
- ✅ Block Common Exploits

*SSL:*
- Request a new SSL Certificate (Let's Encrypt)
- ✅ Force SSL, ✅ HTTP/2 Support
- Hinter dem Cloudflare-Proxy klappt die Bestätigung am zuverlässigsten mit
  **Use a DNS Challenge → Cloudflare** und einem Cloudflare-API-Token
  (Berechtigung *Zone → DNS → Edit*, nur für `basislager.cloud`).

*Advanced* – **unbedingt eintragen**, sonst scheitern Bild-Uploads über 1 MB:

```nginx
client_max_body_size 20m;
```

## 8. Erstes Konto anlegen

**Gleich nach dem Start**, bevor du den Link weitergibst:
`https://wunschbaum.basislager.cloud/registrieren` öffnen und dein Konto anlegen.

Nur das allererste Konto braucht keine Einladung. Danach geht die Registrierung nur noch über
Einladungslinks aus einer Gruppe.

Danach:
1. Gruppe anlegen, z. B. „Familie Scheerle“.
2. Einladungslink erstellen und zuerst an dich selbst schicken.
3. In einem privaten Browserfenster testen, ob die Registrierung über den Link klappt.

## 9. Backups

```bash
cd /opt/wunschbaum
sh scripts/backup.sh             # einmal von Hand testen
ls -lh backups/
```

Täglich um 3:15 Uhr per Cron (`crontab -e`):

```cron
15 3 * * * cd /opt/wunschbaum && sh scripts/backup.sh >> backups/backup.log 2>&1
```

Das Skript sichert die Datenbank und alle Bilder nach `/opt/wunschbaum/backups` und löscht Sicherungen,
die älter als 30 Tage sind. **Kopiere den Ordner zusätzlich woandershin**, z. B. per Proxmox Backup Server,
auf ein NAS oder durch Sichern des ganzen LXC in Proxmox (Datacenter → Backup).

Wiederherstellen (überschreibt die aktuellen Daten):

```bash
sh scripts/restore.sh backups/db_2026-12-01_0315.sql.gz backups/uploads_2026-12-01_0315.tar.gz
docker compose restart app
```

## 10. Aktualisieren

```bash
cd /opt/wunschbaum
sh scripts/backup.sh             # sicher ist sicher
git pull
docker compose up -d --build
```

Datenbank-Änderungen werden beim Start automatisch eingespielt.

---

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| Bild-Upload bricht ab, Fehler 413 | `client_max_body_size 20m;` im Nginx Proxy Manager unter *Advanced* fehlt |
| Anmeldung klappt nicht, „Invalid origin“ in den Logs | `APP_URL` in `.env` stimmt nicht exakt mit der Adresse im Browser überein; danach `docker compose up -d` |
| Cloudflare-Fehler 521/522 | NPM oder der Container nicht erreichbar: Portweiterleitung 443 im Router? `docker compose ps`? |
| Cloudflare-Fehler 525/526 | SSL-Zertifikat im NPM fehlt oder ist ungültig (Schritt 7), oder der SSL-Modus in Cloudflare passt nicht |
| Fehler 502 vom NPM | Container läuft nicht oder falsche IP/Port im Proxy Host: `docker compose ps`, `curl http://<LXC-IP>:3000/api/health` |
| Mails kommen nicht an | `docker compose exec app pnpm mail:test …` – die Ausgabe erklärt den Fehler |
| Docker startet im LXC nicht | Features **nesting** und **keyctl** in Proxmox aktivieren, Container neu starten |

Logs: `docker compose logs -f app` · Neustart: `docker compose restart app` ·
In die Datenbank schauen: `docker compose exec db psql -U wunschliste`
