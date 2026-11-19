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
