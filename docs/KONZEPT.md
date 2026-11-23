# Konzept: Wunschbaum

Stand: erster lauffähiger Prototyp, auf Proxmox unter `wunschbaum.basislager.cloud` getestet.

## Grundregeln

- **Konten:** E-Mail + Passwort, alternativ Magic Link. Die E-Mail-Adresse muss bestätigt werden.
- **Profile:** Jede Person mit Wunschliste ist ein *Profil*. Jeder Benutzer hat genau eines.
  Kinderprofile haben zunächst kein Konto und werden von beiden Eltern verwaltet. Sie können später
  an ein eigenes Konto des Kindes übergeben werden (die Liste bleibt erhalten, die Eltern verlieren den Verwaltungszugriff).
- **Gruppen:** Jeder kann Gruppen erstellen und wird deren Admin. Admins laden per Link oder Mail ein
  und können weitere Admins ernennen.
  - **Einladungslinks** sind mehrfach nutzbar bis zum Ablauf (1–30 Tage) und können zurückgezogen werden.
  - **Mail-Einladungen** gelten nur für genau diese Adresse und einmalig.
  - **Registrieren** kann man sich nur über eine Einladung. Das allererste Konto (Einrichtung) braucht keine.
  - **Mindestens ein Admin:** Der letzte Admin kann erst gehen, wenn er jemand anderen ernannt hat.
    Geht das letzte Mitglied, wird die Gruppe aufgelöst.
- **Eine Wunschliste pro Profil.** Wünsche sind standardmäßig in *allen* Gruppen des Profils sichtbar,
  optional nur in ausgewählten.
- **Wunsch:** Titel, Beschreibung, ungefährer Preis, mehrere Links, mehrere Bilder bzw. Screenshots.
  Er kann archiviert (z. B. nach dem Fest) und wiederhergestellt werden.

## Kinderprofile

- **Anlegen:** Jeder kann über „+ Kinderprofil“ auf der Startseite ein Profil anlegen und wird damit Verwalter.
  Ein Umschalter oben wechselt zwischen der eigenen Liste und den Kinderlisten.
- **Weitere Verwalter** (z. B. der andere Elternteil) lassen sich nur aus Personen der eigenen Gruppen wählen.
  Es bleibt immer mindestens ein Verwalter.
- **Gruppen:** Ein Kind kann nur in Gruppen aufgenommen werden, in denen man selbst Mitglied ist.
  Kinder können keine Gruppen-Admins sein. Bleiben in einer Gruppe nur noch Kinder übrig, wird sie aufgelöst.
- **Reservierungen:** Verwalter sehen den Status über „Was ist reserviert?“ (Ansicht für Schenkende).
- **Übergabe:**
  - Ein Verwalter schickt einen Link an die Mail-Adresse des Kindes (14 Tage gültig, zurückziehbar).
  - Das Kind registriert sich damit (nur mit genau dieser Adresse) oder meldet sich an und übernimmt die Liste.
  - Wünsche, Bilder und Gruppen bleiben erhalten. Hatte das Konto schon eigene Wünsche oder Gruppen,
    werden sie zusammengeführt.
  - Die Verwalter verlieren den Zugriff und sind danach normale Schenkende. Das Kind sieht ab dann keine Reservierungen,
    bestehende Reservierungen bleiben aber gültig.

## Teilen per Link (Gäste ohne Konto)

- Besitzer bzw. Eltern bei Kinderlisten erstellen pro Person einen Link mit Bezeichnung (z. B. „Patenonkel Peter“).
  Er ist optional befristet und lässt sich zurückziehen. Zurückgezogene oder abgelaufene Links liefern 404.
  Gast-Reservierungen bleiben dabei bestehen.
- Gäste sehen nur **aktive Wünsche, die für alle Gruppen sichtbar sind**. Bilder laufen über eigene Link-URLs.
- **Der Link ist die Identität:** Reservierungen von Gästen hängen direkt am Link (`reservation.reserved_by_share_link_id`).
  Wer den Link öffnet, sieht sie in jedem Browser und auf jedem Gerät als „von dir reserviert“ und kann sie aufheben.
  Es gibt keine Namensabfrage und nichts, was im Browser gespeichert wird. Deshalb gilt: **ein Link pro Person bzw. Haushalt**.
- **Reservierungen** hängen entweder an einem Konto oder an einem Link (Check-Constraint). Gäste und Familie sehen
  gegenseitig nur „reserviert“. Die Bezeichnung des Links sieht nur der Besitzer.
- **Der Besitzer erfährt nichts:** Die Link-Verwaltung zeigt weder Gäste noch Reservierungen, und angemeldet
  kann der Besitzer seinen eigenen Link nicht öffnen (403). In einem privaten Fenster ließe es sich nicht verhindern,
  deshalb weist die Oberfläche darauf hin.

## Neue Gruppenmitglieder und laufende Events

„Laufend“ heißt: ohne Datum oder Datum heute bzw. später. Kommt jemand in die Gruppe (Einladung angenommen oder Kind
aufgenommen):
- **Alle beschenken alle und bisher die ganze Gruppe dabei:** Die Person wird automatisch hinzugefügt.
- **Wichteln oder nur ausgewählte Teilnehmende:** Ersteller und Gruppen-Admins bekommen eine Benachrichtigung in der App
  (🔔) und per Mail, mit Button „Zum Event“. Ist schon ausgelost, erklärt die Nachricht, dass man zurücksetzen und
  neu auslosen muss. Wer die Änderung selbst ausgelöst hat, wird nicht benachrichtigt.

## Administration

- Unter `/admin` gibt es eine eigene Anmeldung mit **separaten Admin-Konten** (Tabelle `admin_account`), unabhängig von
  den normalen Konten. Admin-Konten entstehen nur per Kommandozeile (`pnpm admin create …`), nie über die Webseite.
- **Sicherheit:**
  - Passwörter als scrypt-Hash, mindestens 12 Zeichen.
  - Sitzungs-Token nur gehasht gespeichert, Cookie `wb_admin` (HttpOnly, SameSite=Strict, Secure, nur für `/api/admin`),
    gültig 12 Stunden.
  - Sperre nach 5 Fehlversuchen (15 Minuten, pro IP und Adresse).
  - Origin-Prüfung bei ändernden Anfragen.
- **Funktionen:** Übersicht mit Mailstatus; Benutzer (bearbeiten, bestätigen, Passwort setzen, abmelden, löschen);
  Gruppen (umbenennen, Mitglieder und Rollen, löschen); Kinderprofile (Verwalter, löschen); Events löschen;
  Einladungen und Teilen-Links zurückziehen.
- **Bewusst ohne Reservierungen und Wichtel-Zuordnungen**, damit die Überraschung auch für den Admin selbst erhalten
  bleibt. Für Notfälle gibt es die protokollierte Notfall-Einsicht beim Event.
- **Benutzer löschen** entfernt das eigene Profil samt Wünschen, Bildern, Gruppenmitgliedschaften und eigenen
  Reservierungen. Kinderprofile, die nur diese Person verwaltet hat, bleiben ohne Verwalter bestehen und werden markiert.

## Bilder

- Bis zu 8 Bilder pro Wunsch: Dateiauswahl (am Handy auch Kamera), Einfügen mit Strg+V, Drag & Drop.
- Der Browser verkleinert große Fotos schon vor dem Upload (max. 2400 px).
- Der Server prüft am Inhalt, ob es wirklich ein Bild ist (JPG, PNG, WebP, GIF, AVIF; kein SVG).
  Er dreht das Bild richtig, verkleinert es auf max. 1600 px plus Vorschaubild mit 480 px und speichert beides als WebP.
  **Dabei werden alle Metadaten entfernt** (GPS-Position, Kameradaten).
- Ausgeliefert werden die Bilder nur über die API und nur an Berechtigte: Verwalter der Liste, wer den Wunsch
  sehen darf oder ihn reserviert hat. Für alle anderen gibt es 404.
- Ein neues oder entferntes Bild zählt für Reservierende als Änderung.
- Ablage: `UPLOAD_DIR/<wunsch-id>/`, in Produktion im Docker-Volume `uploads`.

## Sichtbarkeit von Reservierungen

| Wer schaut auf Wunsch W von Profil P? | Sieht |
|---|---|
| P selbst (eigenes Konto) | nur den Wunsch, **keine** Reservierungsinfo, auch nicht in der API-Antwort |
| Eltern eines verwalteten Kinderprofils | Status wie andere Gruppenmitglieder (für die Abstimmung) |
| Wer W reserviert hat | „Von dir reserviert“ und kann die Reservierung lösen |
| Andere Gruppenmitglieder | „Verfügbar“ oder „Reserviert“ (anonym, ohne Namen) |
| Ohne gemeinsame Gruppe | nichts |

Die Regeln stehen zentral in `apps/api/src/services/visibility.ts` und sind in
`apps/api/test/reservations.test.ts` abgesichert. Die eigene Liste ist über die Schenkenden-Sicht nicht abrufbar.

Wird ein reservierter Wunsch gelöscht oder geändert, sieht der Reservierende einen Hinweis.
Der Wünschende erfährt davon nichts. Das Löschen eines reservierten Wunsches liefert dieselbe Antwort wie bei
einem freien Wunsch. Intern wird er nur als gelöscht markiert, damit der Reservierende den Hinweis bekommt.
Umsortieren und Archivieren zählen nicht als „geändert“.

## Events

- **Typen:** *Wichteln* (Auslosung) oder *Standard* (alle beschenken alle). Beide haben Datum und Budget.
  Beim Anlegen kommt die Frage „Wird gewichtelt?“ nach den Grunddaten (Vorauswahl: nein). Organisatoren können
  sie jederzeit ändern. Wird ein ausgelostes Wichteln ausgeschaltet, wird die Auslosung verworfen. Es zählt dann
  auch nicht als „Vorjahr“.
- **Budget** ist ein Hinweis. Wünsche über dem Budget werden markiert, nicht ausgeblendet.
- **Ausschlüsse** werden gerichtet gespeichert („A darf B nicht ziehen“):
  - **Haushalte** (z. B. Ehepaare) erzeugen beidseitige Ausschlüsse und werden pro Gruppe einmal gepflegt.
  - **Zusätzliche Ausschlüsse** pro Event lassen sich von Hand setzen.
  - **Vorjahr:** Wer jemanden im letzten Wichteln der Gruppe beschenkt hat, zieht ihn nicht erneut (einseitig).
- **Auslosung** auf dem Server. Ist keine gültige Zuordnung möglich, gibt es eine klare Fehlermeldung.
  Jede Person sieht nur, wen sie selbst beschenkt. Für Kinderprofile sehen es die Eltern.
- **Notfall-Einsicht:** Der Organisator kann die Zuordnung nach ausdrücklicher Bestätigung aufdecken
  oder neu auslosen. Das wird protokolliert und allen Teilnehmenden angezeigt.
- **Organisatoren** sind der Ersteller des Events und alle Admins der Gruppe. Event anlegen darf jedes Gruppenmitglied.
- **Ablauf:** Neue Events übernehmen alle Gruppenmitglieder als Teilnehmende, auch Kinder.
  Teilnehmende und Ausschlüsse lassen sich nur vor der Auslosung ändern (sonst erst „Zurücksetzen“).
  Wichteln braucht mindestens 3 Teilnehmende.
- **Vorjahres-Ausschlüsse** stammen aus dem letzten ausgelosten Wichteln derselben Gruppe. Sie werden nur
  intern bei der Auslosung verwendet und nie angezeigt, weil sie sonst die alte Zuordnung verraten würden. Gibt es mit
  ihnen keine Lösung, wird ohne sie gelost und der Organisator bekommt einen Hinweis.
- **Kinder:** Eltern sehen auf der Event-Seite auch, wen ihre Kinder beschenken.
- **Zuordnung ansehen:** Die eigene Zuordnung muss man aktiv aufdecken (Schutz vor neugierigen Blicken auf den Bildschirm).
  Der Link zur Wunschliste zeigt das Budget an und markiert teurere Wünsche.
- **Algorithmus:** `apps/api/src/services/draw.ts` (Backtracking, zuerst die Person mit den wenigsten Möglichkeiten).

## Fahrplan

- [x] **Schritt 1 – Grundgerüst:** Monorepo, Docker, komplettes DB-Schema, Registrierung mit E-Mail-Bestätigung,
      Login (Passwort und Magic Link), Passwort-Reset, App-Layout für Handy und Desktop
- [x] **Schritt 2 – Gruppen:** Gruppen anlegen, Einladungslinks und Mail-Einladungen, Mitglieder und Admins;
      Registrierung nur noch per Einladung (Ausnahme: das allererste Konto)
- [x] **Schritt 3 – Wünsche:** eigene Liste (Links, Preis, Reihenfolge, Archiv), Sichtbarkeit pro Gruppe
- [x] **Schritt 4 – Reservierungen:** Listen anderer ansehen, reservieren, „Meine Reservierungen“
      mit Hinweisen (geändert, archiviert, gelöscht, kein Zugriff mehr), Tests für die Sichtbarkeitsregeln
- [x] **Schritt 5 – Bilder:** Upload, Kamera, Einfügen mit Strg+V, Drag & Drop, Verkleinern, Metadaten entfernen, geschützte Auslieferung
- [x] **Schritt 6 – Kinderprofile:** anlegen, zweiten Elternteil hinzufügen, in Gruppen aufnehmen, Übergabe an eigenes Konto
- [x] **Schritt 7 – Events und Wichteln:** Budget, Haushalte, Ausschlüsse, Vorjahres-Ausschluss, Auslosung, Notfall-Einsicht

## Offene ToDos

- [x] **SMTP-Versand** eingebaut, mit Prüfung beim Start und `pnpm mail:test`. Offen: Zugangsdaten auf dem Server eintragen.
- [ ] Link-Vorschau (Titel und Bild von Shop-Seiten automatisch holen)
- [ ] Benachrichtigungen per Mail (z. B. „Du wurdest ausgelost“, „Ein Wunsch, den du reserviert hast, wurde geändert“)
- [x] Backup: `scripts/backup.sh` / `scripts/restore.sh` (Datenbank + Bilder), siehe docs/DEPLOYMENT.md
- [ ] Später: native App mit Expo / React Native über dieselbe API
