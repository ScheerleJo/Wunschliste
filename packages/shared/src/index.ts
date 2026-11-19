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
