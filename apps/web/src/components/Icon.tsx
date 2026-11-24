/**
 * Zentrale Icon-Zuordnung (Font Awesome Free, selbst gehostet, keine Anfragen an fontawesome.com).
 *
 * Jede Bedeutung steht genau einmal hier. Ein anderes Icon für z. B. "Bearbeiten" = eine Zeile ändern.
 * Stil: solid (Standard) bzw. regular, wo als `far…` importiert. Auswahl siehe docs/ICONS.md.
 * "duotone" sowie faTreeChristmas/faHandWave gibt es nur in Font Awesome Pro; hier stehen die Free-Varianten.
 */
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowLeft,
  faArrowRight,
  faArrowsLeftRight,
  faBan,
  faBookmark,
  faBoxArchive,
  faCamera,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faChild,
  faDice,
  faEnvelope,
  faEuroSign,
  faEye,
  faGear,
  faGift,
  faHouse,
  faLink,
  faLock,
  faPenToSquare,
  faRotateLeft,
  faShareNodes,
  faSleigh,
  faStopwatch,
  faTrashCan,
  faTree,
  faTriangleExclamation,
  faUserGroup,
  faUsers,
  faUserSecret,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faBell as farBell, faFaceSmile as farFaceSmile } from "@fortawesome/free-regular-svg-icons";

const icons = {
  /** Wunschliste, Geschenk, freies Schenken */
  gift: faGift,
  /** weiter / öffnen */
  forward: faArrowRight,
  /** zurück */
  back: faArrowLeft,
  /** Shop-, Einladungs- oder Teilen-Link */
  link: faLink,
  /** Button "Teilen" */
  share: faShareNodes,
  /** Wichteln */
  secretSanta: faSleigh,
  /** bearbeiten, "wurde geändert" */
  edit: faPenToSquare,
  /** schließen, entfernen */
  close: faXmark,
  /** reservieren, Reservierungen */
  reserve: faBookmark,
  /** E-Mail, Mail-Einladung */
  mail: faEnvelope,
  /** geheim, nicht verraten */
  secret: faUserSecret,
  /** erledigt, von dir reserviert, kopiert */
  check: faCheck,
  /** Gruppen */
  groups: faUsers,
  /** Kinderprofil */
  child: faChild,
  /** archivieren, Archiv */
  archive: faBoxArchive,
  /** löschen, gelöscht */
  delete: faTrashCan,
  /** nur für dich sichtbar, kein Zugriff */
  private: faLock,
  /** Events (gewünscht: faTreeChristmas, nur in Pro) */
  events: faTree,
  /** Benachrichtigungen */
  bell: farBell,
  /** Budget */
  budget: faEuroSign,
  /** leere Wunschliste (bei anderen) */
  empty: farFaceSmile,
  /** Notfall-Einsicht */
  reveal: faEye,
  /** "Nur: Gruppe X" sichtbar */
  visibility: faEye,
  /** Einstellungen, Organisation */
  settings: faGear,
  /** Haushalt */
  household: faHouse,
  /** Paar, das sich nicht zieht */
  pair: faArrowsLeftRight,
  /** Ausschluss */
  exclude: faBan,
  /** auslosen */
  draw: faDice,
  /** Warnung */
  warning: faTriangleExclamation,
  /** nach oben / unten schieben */
  up: faChevronUp,
  down: faChevronDown,
  /** wiederherstellen */
  restore: faRotateLeft,
  /** Bild hinzufügen */
  camera: faCamera,
  /** Anzahl Teilnehmende */
  participants: faUserGroup,
  /** vorheriges / nächstes Bild */
  prev: faChevronLeft,
  next: faChevronRight,
  /** Abmelde-Timer */
  timer: faStopwatch,
  /** auf-/zuklappen */
  expand: faChevronDown,
} satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof icons;

/**
 * Icon in Schriftgröße und -farbe des umgebenden Textes.
 * Ohne `label` rein dekorativ (für Screenreader unsichtbar), mit `label` wird es vorgelesen.
 */
export function Icon({ name, className = "", label }: { name: IconName; className?: string; label?: string }) {
  return (
    <FontAwesomeIcon
      icon={icons[name]}
      className={className}
      aria-hidden={label ? undefined : true}
      title={label}
      fixedWidth
    />
  );
}
