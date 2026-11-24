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

| Icon | Bedeutung | Wo (Auswahl) | Deine Wahl | style |
| --- | --- | --- | --- | --- |
| 🎁 | Wunschliste, Geschenk, „freies Schenken“ | Menü „Meine Liste“, Startseite, Gruppen, Events | `faGift` | duotone |
| → | weiter / öffnen | Startseite, Gruppen, Reservierungen, Benachrichtigungen | `faArrowRight` | classic |
| ← | zurück | Kopf von Gruppen-, Event-, Listen- und Kinderseiten | `faArrowLeft` | classic |
| 🔗 | Link (Shop-Link, Einladungslink, Teilen-Link) | Wunschkarten, Einladungen, Teilen-Dialog | `faLink` | classic |
| 🔗 Teilen | Button „Teilen“ | Meine Liste | `faShareNodes` | classic |
| 🎅 | Wichteln | Events, Event-Formular, Gruppenseite | `faSleigh` | duotone |
| ✏️ | bearbeiten / „wurde geändert“ | Wunschkarten, Hinweise bei Reservierungen | `faPenToSquare` | duotone |
| ✕ | schließen / entfernen | Dialoge, Bildergalerie, Bilder im Editor, Admin | `faXmark` | classic |
| 🔖 | reservieren / Reservierungen | Menü „Reserviert“, Reservieren-Button | `faBookmark` | duotone |
| ✉️ | E-Mail / Mail-Einladung | Einladungen, Übergabe, Admin | `faEnvelope` | classic |
| 🤫 | „geheim, nicht verraten“ | Teilen-Dialog, Gastseite, Wichtel-Zuordnung, Admin-Hinweis | `faUserSecret` | classic |
| ✓ | erledigt / von dir reserviert / kopiert | Status-Badge, Kopieren-Button | `faCheck` | classic |
| 👪 | Gruppe(n) | Menü „Gruppen“, Startseite, Gruppenliste | `faUsers` | duotone |
| 👶 | Kinderprofil | Startseite, Umschalter, Gruppen, Events | `faChild` | duotone |
| 📦 | archivieren / Archiv | Wunschkarten, Hinweise | `faBoxArchive` | classic |
| 🗑 | löschen / gelöscht | Wunschkarten, Hinweise | `faTrashCan` | classic |
| 🔒 | nur für dich sichtbar / kein Zugriff | Wunschkarten, Reservierungen | `faLock` | |
| 🎄 | Events | Menü „Events“, leere Event-Seite | `faTreeChristmas` | duotone |
| 🔔 | Benachrichtigungen | Kopfzeile, Benachrichtigungsseite | `faBell` (regular) | classic |
| 💶 | Budget | Event-Karten, Event-Seite | `faEuroSign` | classic |
| 🎈 | leere Wunschliste (bei anderen) | Wunschliste ansehen, Gastseite | `faFaceSmile` (regular) | classic |
| 👀 | Notfall-Einsicht | Event-Seite (Organisation) | `faEye` | classic |
| 👁 | „Nur: Gruppe X“ sichtbar | Wunschkarten | `faEye` | |
| ⚙️ | Einstellungen / Organisation | Kinderliste, Event-Seite | `faGear` | classic |
| 🏠 | Haushalt | Gruppenseite, Event-Organisation | `faHouse` | duotone |
| ↔ | Paar, das sich nicht zieht | Event-Organisation | `faArrowsLeftRight` | classic |
| 🚫 | Ausschluss | Event-Organisation | `faBan` | classic |
| 🎲 | auslosen / neu auslosen | Event-Organisation | `faDice` | duotone |
| ⚠️ | Warnung | Event-Formular | `faTriangleExclamation` | duotone |
| ↑ ↓ | Wunsch nach oben/unten schieben | Meine Liste | `faChevronUp` / `faChevronDown` | classc |
| ↩️ | wiederherstellen | Archiv | `faRotateLeft` | classic |
| 📷 | Bild hinzufügen | Wunsch-Editor | `faCamera` | duotone |
| 👥 | Anzahl Teilnehmende | Event-Karten | `faUserGroup` | duotone |
| ‹ › | vorheriges / nächstes Bild | Bildergalerie | `faChevronLeft` / `faChevronRight` | classic |
| ⏱ | Abmelde-Timer | Admin-Kopfzeile | `faStopwatch` | duotone |
| ▾ (SVG) | Gruppe auf-/zuklappen | Startseite | `faChevronDown` | clasic |
| 👋 | Begrüßung „Hallo …“ | Startseite | `faHandWave` | duotone |

### Umgesetzt (Font Awesome Free)

- **Stil:** überall *solid*, nur `faFaceSmile` und `faBell` *regular*. „duotone“ gibt es nur in Font Awesome Pro (Abo).
- **Pro-Icons:** `faTreeChristmas` (Events) wird vorerst durch `faTree` ersetzt. Für `faHandWave` (Begrüßung) gibt es kein
  passendes Free-Icon, die Begrüßung bleibt deshalb vorerst das Emoji 👋.
- **Später einfach tauschbar:** Mit einem Pro-Abo lassen sich alle Wünsche in `apps/web/src/components/Icon.tsx`
  umsetzen (Pakete `@fortawesome/pro-duotone-svg-icons` usw. mit privatem npm-Token).

