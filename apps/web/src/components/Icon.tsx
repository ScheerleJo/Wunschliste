/**
 * Zentrale Icon-Zuordnung (Font Awesome Pro, selbst gehostet, keine Anfragen an fontawesome.com im Browser).
 *
 * Jede Bedeutung steht genau einmal hier. Ein anderes Icon für z. B. "Bearbeiten" = eine Zeile ändern.
 * Auswahl und Stil laut docs/ICONS.md:
 *   fad… = duotone   (@fortawesome/pro-duotone-svg-icons)
 *   fas… = solid     (@fortawesome/pro-solid-svg-icons, "classic")
 *   far… = regular   (@fortawesome/pro-regular-svg-icons)
 *
 * Die Pro-Pakete brauchen beim Installieren den Font Awesome Package Token (siehe .npmrc und docs/DEPLOYMENT.md).
 */
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBookmark as fadBookmark,
  faCamera as fadCamera,
  faChild as fadChild,
  faDice as fadDice,
  faGift as fadGift,
  faHandWave as fadHandWave,
  faHouse as fadHouse,
  faPenToSquare as fadPenToSquare,
  faSleigh as fadSleigh,
  faStopwatch as fadStopwatch,
  faTreeChristmas as fadTreeChristmas,
  faTriangleExclamation as fadTriangleExclamation,
  faUserGroup as fadUserGroup,
  faUsers as fadUsers,
} from "@fortawesome/pro-duotone-svg-icons";
import {
  faArrowLeft as fasArrowLeft,
  faArrowRight as fasArrowRight,
  faArrowsLeftRight as fasArrowsLeftRight,
  faBan as fasBan,
  faBoxArchive as fasBoxArchive,
  faCheck as fasCheck,
  faChevronDown as fasChevronDown,
  faChevronLeft as fasChevronLeft,
  faChevronRight as fasChevronRight,
  faChevronUp as fasChevronUp,
  faEnvelope as fasEnvelope,
  faEuroSign as fasEuroSign,
  faEye as fasEye,
  faGear as fasGear,
  faLink as fasLink,
  faLock as fasLock,
  faRotateLeft as fasRotateLeft,
  faShareNodes as fasShareNodes,
  faTrashCan as fasTrashCan,
  faUserSecret as fasUserSecret,
  faXmark as fasXmark,
} from "@fortawesome/pro-solid-svg-icons";
import { faBell as farBell, faFaceSmile as farFaceSmile } from "@fortawesome/pro-regular-svg-icons";

const icons = {
  /** Wunschliste, Geschenk, freies Schenken */
  gift: fadGift,
  /** weiter / öffnen */
  forward: fasArrowRight,
  /** zurück */
  back: fasArrowLeft,
  /** Shop-, Einladungs- oder Teilen-Link */
  link: fasLink,
  /** Button "Teilen" */
  share: fasShareNodes,
  /** Wichteln */
  secretSanta: fadSleigh,
  /** bearbeiten, "wurde geändert" */
  edit: fadPenToSquare,
  /** schließen, entfernen */
  close: fasXmark,
  /** reservieren, Reservierungen */
  reserve: fadBookmark,
  /** E-Mail, Mail-Einladung */
  mail: fasEnvelope,
  /** geheim, nicht verraten */
  secret: fasUserSecret,
  /** erledigt, von dir reserviert, kopiert */
  check: fasCheck,
  /** Gruppen */
  groups: fadUsers,
  /** Kinderprofil */
  child: fadChild,
  /** archivieren, Archiv */
  archive: fasBoxArchive,
  /** löschen, gelöscht */
  delete: fasTrashCan,
  /** nur für dich sichtbar, kein Zugriff */
  private: fasLock,
  /** Events */
  events: fadTreeChristmas,
  /** Benachrichtigungen */
  bell: farBell,
  /** Budget */
  budget: fasEuroSign,
  /** leere Wunschliste (bei anderen) */
  empty: farFaceSmile,
  /** Notfall-Einsicht */
  reveal: fasEye,
  /** "Nur: Gruppe X" sichtbar */
  visibility: fasEye,
  /** Einstellungen, Organisation */
  settings: fasGear,
  /** Haushalt */
  household: fadHouse,
  /** Paar, das sich nicht zieht */
  pair: fasArrowsLeftRight,
  /** Ausschluss */
  exclude: fasBan,
  /** auslosen */
  draw: fadDice,
  /** Warnung */
  warning: fadTriangleExclamation,
  /** nach oben / unten schieben */
  up: fasChevronUp,
  down: fasChevronDown,
  /** wiederherstellen */
  restore: fasRotateLeft,
  /** Bild hinzufügen */
  camera: fadCamera,
  /** Anzahl Teilnehmende */
  participants: fadUserGroup,
  /** vorheriges / nächstes Bild */
  prev: fasChevronLeft,
  next: fasChevronRight,
  /** Abmelde-Timer */
  timer: fadStopwatch,
  /** auf-/zuklappen */
  expand: fasChevronDown,
  /** Begrüßung "Hallo …" */
  wave: fadHandWave,
} satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof icons;

/**
 * Icon in Schriftgröße und -farbe des umgebenden Textes (Duotone: zweite Ebene halbtransparent).
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
