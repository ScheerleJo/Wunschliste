# Icons: Umstellung auf Font Awesome

Stand: Die Oberfläche nutzt Emojis und Textzeichen als Icons. Das Logo (Tannenbaum, `apps/web/public/favicon.svg`)
bleibt unverändert.

## Wie Font Awesome eingebunden würde

**Empfehlung: die offiziellen npm-Pakete mit SVG-Icons** (Font Awesome 7, kostenlose „Free“-Icons):

```bash
pnpm --filter @wunschliste/web add @fortawesome/fontawesome-svg-core @fortawesome/free-solid-svg-icons \
  @fortawesome/free-regular-svg-icons @fortawesome/react-fontawesome
```

- **Selbst gehostet:** Die Icons werden mitgebaut, es gibt keine Anfragen an fontawesome.com bzw. ein CDN.
  Das ist gut für den Datenschutz und funktioniert auch offline.
- **Kleine Dateien:** Nur tatsächlich verwendete Icons landen in der App (Tree-Shaking), wenige KB statt einer ganzen Icon-Schriftart.
- **Passt zum Projekt:** `@fortawesome/react-fontawesome` 3.x unterstützt React 19.
- **Kosten und Lizenz:** Die Free-Icons sind kostenlos (Icons CC BY 4.0, Code MIT). Der nötige Lizenzhinweis steckt
  bereits in den Paketdateien.
- **Pro-Icons** bräuchten ein Abo und einen privaten Paket-Token, sind aber nicht nötig.
- **Nicht empfohlen:** ein „Kit“ bzw. CDN-Skript von fontawesome.com. Dann würde jeder Seitenaufruf Daten an
  Font Awesome schicken, und die App hinge von deren Servern ab.

**Umsetzung:** Eine zentrale Komponente `components/Icon.tsx` ordnet Bedeutungen Icons zu, z. B. `<Icon name="edit" />`.
Ein späterer Tausch ist dann eine Zeile. Emojis im Fließtext (z. B. „Hallo Anna 👋“) können bleiben, wo sie Teil des Tons sind.

Icons suchen: <https://fontawesome.com/search?ic=free> (Filter „Free“). Namen im Code: `faGift`, `faPenToSquare` usw.

## Aktuell verwendete Icons

Spalte **Vorschlag** = mein Vorschlag aus den Free-Icons (Stil *solid*, wenn nicht anders angegeben).
Trag in **Deine Wahl** ein, was du lieber möchtest. Leer lassen heißt: Vorschlag übernehmen.

| Icon | Bedeutung | Wo (Auswahl) | Vorschlag | Deine Wahl |
|---|---|---|---|---|
| 🎁 | Wunschliste, Geschenk, „freies Schenken“ | Menü „Meine Liste“, Startseite, Gruppen, Events | `faGift` | |
| → | weiter / öffnen | Startseite, Gruppen, Reservierungen, Benachrichtigungen | `faArrowRight` | |
| ← | zurück | Kopf von Gruppen-, Event-, Listen- und Kinderseiten | `faArrowLeft` | |
| 🔗 | Link (Shop-Link, Einladungslink, Teilen-Link) | Wunschkarten, Einladungen, Teilen-Dialog | `faLink` | |
| 🔗 Teilen | Button „Teilen“ | Meine Liste | `faShareNodes` | |
| 🎅 | Wichteln | Events, Event-Formular, Gruppenseite | `faSleigh` oder `faShuffle` | |
| ✏️ | bearbeiten / „wurde geändert“ | Wunschkarten, Hinweise bei Reservierungen | `faPenToSquare` | |
| ✕ | schließen / entfernen | Dialoge, Bildergalerie, Bilder im Editor, Admin | `faXmark` | |
| 🔖 | reservieren / Reservierungen | Menü „Reserviert“, Reservieren-Button | `faBookmark` | |
| ✉️ | E-Mail / Mail-Einladung | Einladungen, Übergabe, Admin | `faEnvelope` | |
| 🤫 | „geheim, nicht verraten“ | Teilen-Dialog, Gastseite, Wichtel-Zuordnung, Admin-Hinweis | `faUserSecret` | |
| ✓ | erledigt / von dir reserviert / kopiert | Status-Badge, Kopieren-Button | `faCheck` | |
| 👪 | Gruppe(n) | Menü „Gruppen“, Startseite, Gruppenliste | `faUsers` | |
| 👶 | Kinderprofil | Startseite, Umschalter, Gruppen, Events | `faChild` | |
| 📦 | archivieren / Archiv | Wunschkarten, Hinweise | `faBoxArchive` | |
| 🗑 | löschen / gelöscht | Wunschkarten, Hinweise | `faTrashCan` | |
| 🔒 | nur für dich sichtbar / kein Zugriff | Wunschkarten, Reservierungen | `faLock` | |
| 🎄 | Events | Menü „Events“, leere Event-Seite | `faCalendarDays` (passt auch zu Geburtstagen) oder `faTree` | |
| 🔔 | Benachrichtigungen | Kopfzeile, Benachrichtigungsseite | `faBell` (regular) | |
| 💶 | Budget | Event-Karten, Event-Seite | `faEuroSign` | |
| 🎈 | leere Wunschliste (bei anderen) | Wunschliste ansehen, Gastseite | `faFaceSmile` (regular) | |
| 👀 | Notfall-Einsicht | Event-Seite (Organisation) | `faEye` | |
| 👁 | „Nur: Gruppe X“ sichtbar | Wunschkarten | `faEye` | |
| ⚙️ | Einstellungen / Organisation | Kinderliste, Event-Seite | `faGear` | |
| 🏠 | Haushalt | Gruppenseite, Event-Organisation | `faHouse` | |
| ↔ | Paar, das sich nicht zieht | Event-Organisation | `faArrowsLeftRight` | |
| 🚫 | Ausschluss | Event-Organisation | `faBan` | |
| 🎲 | auslosen / neu auslosen | Event-Organisation | `faDice` | |
| ⚠️ | Warnung | Event-Formular | `faTriangleExclamation` | |
| ↑ ↓ | Wunsch nach oben/unten schieben | Meine Liste | `faChevronUp` / `faChevronDown` | |
| ↩️ | wiederherstellen | Archiv | `faRotateLeft` | |
| 📷 | Bild hinzufügen | Wunsch-Editor | `faCamera` | |
| 👥 | Anzahl Teilnehmende | Event-Karten | `faUserGroup` | |
| ‹ › | vorheriges / nächstes Bild | Bildergalerie | `faChevronLeft` / `faChevronRight` | |
| ⏱ | Abmelde-Timer | Admin-Kopfzeile | `faStopwatch` | |
| ▾ (SVG) | Gruppe auf-/zuklappen | Startseite | `faChevronDown` | |
| 👋 | Begrüßung „Hallo …“ | Startseite | bleibt Emoji (Vorschlag) | |
