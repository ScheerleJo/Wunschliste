// Von API und Clients (Web, später Mobile) gemeinsam genutzte Typen und Validierung.
import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Bitte gib deinen Namen an").max(80),
  email: z.email("Bitte gib eine gültige E-Mail-Adresse an"),
  password: z.string().min(8, "Das Passwort muss mindestens 8 Zeichen lang sein").max(128),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email("Bitte gib eine gültige E-Mail-Adresse an"),
  password: z.string().min(1, "Bitte gib dein Passwort ein"),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Ein Profil ist eine Person mit Wunschliste. Kinderprofile haben (noch) kein eigenes Konto. */
export interface ProfileDto {
  id: string;
  displayName: string;
  /** true, wenn das Profil (noch) von Erziehungsberechtigten verwaltet wird */
  managed: boolean;
}

export interface MeDto {
  user: { id: string; name: string; email: string };
  profile: ProfileDto;
  /** Kinderprofile, die dieser Benutzer verwaltet */
  managedProfiles: ProfileDto[];
}

// ---------------------------------------------------------------------------
// Gruppen & Einladungen
// ---------------------------------------------------------------------------

export const groupInputSchema = z.object({
  name: z.string().trim().min(1, "Bitte gib einen Namen an").max(60, "Maximal 60 Zeichen"),
  description: z.string().trim().max(300, "Maximal 300 Zeichen").optional().nullable(),
});
export type GroupInput = z.infer<typeof groupInputSchema>;

export const createInviteSchema = z.object({
  /** optional: Einladung direkt per Mail verschicken */
  email: z.email("Bitte gib eine gültige E-Mail-Adresse an").optional().nullable(),
  expiresInDays: z.number().int().min(1).max(90).default(14),
  /** null = beliebig oft verwendbar */
  maxUses: z.number().int().min(1).max(500).optional().nullable(),
});
export type CreateInviteInput = z.input<typeof createInviteSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export type GroupRole = "admin" | "member";

export interface GroupSummaryDto {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myRole: GroupRole;
}

export interface GroupMemberDto {
  profileId: string;
  displayName: string;
  role: GroupRole;
  managed: boolean;
  /** Kinderprofil, das ich verwalte */
  managedByMe: boolean;
  isMe: boolean;
  joinedAt: string;
}

export interface GroupDetailDto extends GroupSummaryDto {
  members: GroupMemberDto[];
}

export interface InviteDto {
  id: string;
  url: string;
  email: string | null;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  createdByName: string;
}

export interface InvitePreviewDto {
  groupName: string;
  invitedByName: string;
  /** an diese Adresse gebunden (nur zur Anzeige) */
  email: string | null;
  valid: boolean;
  /** Grund, falls ungültig */
  reason: "expired" | "revoked" | "used_up" | null;
  alreadyMember: boolean;
}

export interface RegistrationStatusDto {
  /** true, solange noch kein Konto existiert (erstes Konto = Einrichtung) */
  firstUser: boolean;
}

// ---------------------------------------------------------------------------
// Wünsche
// ---------------------------------------------------------------------------

const httpUrl = z
  .string()
  .trim()
  .min(1, "Bitte gib einen Link an")
  .max(2000, "Der Link ist zu lang")
  .transform((v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Bitte gib einen gültigen Link an (https://…)");

export const wishLinkInputSchema = z.object({
  url: httpUrl,
  label: z.string().trim().max(60, "Maximal 60 Zeichen").optional().nullable(),
});

export const wishInputSchema = z.object({
  title: z.string().trim().min(1, "Bitte gib einen Titel an").max(120, "Maximal 120 Zeichen"),
  description: z.string().trim().max(2000, "Maximal 2000 Zeichen").optional().nullable(),
  /** ungefährer Preis in Cent */
  priceCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
  links: z.array(wishLinkInputSchema).max(10, "Maximal 10 Links").default([]),
  /** true = in allen Gruppen des Profils sichtbar, sonst nur in groupIds */
  visibleInAllGroups: z.boolean().default(true),
  groupIds: z.array(z.string()).max(50).default([]),
});
export type WishInput = z.input<typeof wishInputSchema>;

export const reorderSchema = z.object({ ids: z.array(z.string()).max(1000) });

export interface WishLinkDto {
  id: string;
  url: string;
  label: string | null;
}

/**
 * Sicht des Besitzers bzw. Verwalters auf einen Wunsch.
 * Enthält bewusst KEINE Reservierungsinformationen.
 */
export interface OwnWishDto {
  id: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  links: WishLinkDto[];
  images: WishImageDto[];
  visibleInAllGroups: boolean;
  groupIds: string[];
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ProfileGroupDto {
  id: string;
  name: string;
}

/** "29,99" / "29.99" / "30" / "30 €" → Cent; leer → null; ungültig → undefined */
export function parsePriceToCents(input: string): number | null | undefined {
  const s = input.replace(/€|\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  return Math.round(Number(s) * 100);
}

export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

// ---------------------------------------------------------------------------
// Fremde Wunschlisten & Reservierungen
// ---------------------------------------------------------------------------

/**
 * Status aus Sicht eines Schenkenden. Wer reserviert hat, wird anderen bewusst nicht verraten.
 */
export type ReservationView = "available" | "reserved" | "reserved_by_me";

export interface ViewWishDto {
  id: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  links: WishLinkDto[];
  images: WishImageDto[];
  reservation: ReservationView;
  /** nur bei reserved_by_me: Wunsch wurde seit der Reservierung geändert */
  changedSinceReservation: boolean;
}

export interface WishlistViewDto {
  profile: { id: string; displayName: string; managed: boolean };
  /** Gruppen, über die ich diese Liste sehe */
  sharedGroups: ProfileGroupDto[];
  wishes: ViewWishDto[];
}

/**
 * Zustand einer eigenen Reservierung:
 * ok, changed (Wunsch geändert), archived (vom Wünschenden archiviert),
 * deleted (vom Wünschenden gelöscht), no_access (Liste nicht mehr sichtbar)
 */
export type MyReservationState = "ok" | "changed" | "archived" | "deleted" | "no_access";

export interface MyReservationDto {
  wishId: string;
  title: string;
  priceCents: number | null;
  links: WishLinkDto[];
  images: WishImageDto[];
  profile: { id: string; displayName: string };
  reservedAt: string;
  state: MyReservationState;
}

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------

export interface WishImageDto {
  id: string;
  width: number;
  height: number;
}

export const MAX_IMAGES_PER_WISH = 8;
export const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;

export const imageUrl = (id: string, size: "full" | "thumb" = "full") =>
  `/api/images/${id}${size === "thumb" ? "/thumb" : ""}`;

// ---------------------------------------------------------------------------
// Kinderprofile
// ---------------------------------------------------------------------------

export const childInputSchema = z.object({
  displayName: z.string().trim().min(1, "Bitte gib einen Namen an").max(60, "Maximal 60 Zeichen"),
});

export const handoverInputSchema = z.object({
  email: z.email("Bitte gib eine gültige E-Mail-Adresse an"),
});

export interface ChildDetailDto {
  id: string;
  displayName: string;
  guardians: { userId: string; name: string; isMe: boolean }[];
  groups: { id: string; name: string }[];
  pendingHandover: { email: string; expiresAt: string } | null;
}

export interface PersonDto {
  userId: string;
  name: string;
}

export interface HandoverPreviewDto {
  childName: string;
  guardianNames: string[];
  email: string;
  valid: boolean;
  wishCount: number;
}
