# Konzept

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

## Sichtbarkeit von Reservierungen

| Wer schaut auf Wunsch W von Profil P? | Sieht |
|---|---|
| P selbst (eigenes Konto) | nur den Wunsch, **keine** Reservierungsinfo, auch nicht in der API-Antwort |
| Eltern eines verwalteten Kinderprofils | Status wie andere Gruppenmitglieder (für die Abstimmung) |
| Wer W reserviert hat | „Von dir reserviert“ und kann die Reservierung lösen |
| Andere Gruppenmitglieder | „Verfügbar“ oder „Reserviert“ (anonym, ohne Namen) |
| Ohne gemeinsame Gruppe | nichts |

Wird ein reservierter Wunsch gelöscht oder geändert, sieht der Reservierende einen Hinweis.
Der Wünschende erfährt davon nichts. Das Löschen eines reservierten Wunsches liefert dieselbe Antwort wie bei
einem freien Wunsch. Intern wird er nur als gelöscht markiert, damit der Reservierende den Hinweis bekommt.
Umsortieren und Archivieren zählen nicht als „geändert“.

## Events

- **Typen:** *Wichteln* (Auslosung) oder *Standard* (alle beschenken alle). Beide haben Datum und Budget.
- **Budget** ist ein Hinweis. Wünsche über dem Budget werden markiert, nicht ausgeblendet.
- **Ausschlüsse** werden gerichtet gespeichert („A darf B nicht ziehen“):
  - **Haushalte** (z. B. Ehepaare) erzeugen beidseitige Ausschlüsse und werden pro Gruppe einmal gepflegt.
  - **Zusätzliche Ausschlüsse** pro Event lassen sich von Hand setzen.
  - **Vorjahr:** Wer jemanden im letzten Wichteln der Gruppe beschenkt hat, zieht ihn nicht erneut (einseitig).
- **Auslosung** auf dem Server. Ist keine gültige Zuordnung möglich, gibt es eine klare Fehlermeldung.
  Jede Person sieht nur, wen sie selbst beschenkt. Für Kinderprofile sehen es die Eltern.
- **Notfall-Einsicht:** Der Organisator kann die Zuordnung nach ausdrücklicher Bestätigung aufdecken
  oder neu auslosen. Das wird protokolliert und allen Teilnehmenden angezeigt.

## Fahrplan

- [x] **Schritt 1 – Grundgerüst:** Monorepo, Docker, komplettes DB-Schema, Registrierung mit E-Mail-Bestätigung,
      Login (Passwort und Magic Link), Passwort-Reset, App-Layout für Handy und Desktop
- [x] **Schritt 2 – Gruppen:** Gruppen anlegen, Einladungslinks und Mail-Einladungen, Mitglieder und Admins;
      Registrierung nur noch per Einladung (Ausnahme: das allererste Konto)
- [x] **Schritt 3 – Wünsche:** eigene Liste (Links, Preis, Reihenfolge, Archiv), Sichtbarkeit pro Gruppe
- [ ] **Schritt 4 – Reservierungen:** Listen anderer ansehen, reservieren, „Meine Reservierungen“,
      Tests für die Sichtbarkeitsregeln
- [ ] **Schritt 5 – Bilder:** Upload, Kamera, Einfügen mit Strg+V, Verkleinern, Metadaten entfernen, geschützte Auslieferung
- [ ] **Schritt 6 – Kinderprofile:** anlegen, zweiten Elternteil hinzufügen, Übergabe
- [ ] **Schritt 7 – Events und Wichteln:** Budget, Haushalte, Ausschlüsse, Auslosung, Notfall-Einsicht

## Offene ToDos

- [ ] **SMTP-Server einrichten.** Bis dahin fängt Mailpit alle Mails ab (Bestätigung, Magic Link, Reset, Einladungen).
- [ ] Link-Vorschau (Titel und Bild von Shop-Seiten automatisch holen)
- [ ] Benachrichtigungen per Mail (z. B. „Du wurdest ausgelost“)
- [ ] Backup-Konzept (PostgreSQL-Dump und Upload-Volume)
- [ ] Später: native App mit Expo / React Native über dieselbe API
