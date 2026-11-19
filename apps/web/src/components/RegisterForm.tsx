import { useState, type ChangeEvent, type FormEvent } from "react";
import { signUpSchema } from "@wunschliste/shared";
import { Alert, Button, Field } from "./ui.tsx";
import { authClient, authErrorMessage } from "../lib/auth-client.ts";

interface Props {
  /** Einladungs-Token, wird als Header mitgeschickt */
  inviteToken?: string;
  /** Wohin der Bestätigungslink nach dem Klick führt */
  callbackURL?: string;
  /** vorbefüllte (und gesperrte) E-Mail bei Mail-Einladungen */
  fixedEmail?: string | null;
  submitLabel?: string;
}

export function RegisterForm({ inviteToken, callbackURL = "/", fixedEmail, submitLabel = "Konto erstellen" }: Props) {
  const [form, setForm] = useState({ name: "", email: fixedEmail ?? "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as keyof typeof form] ??= issue.message;
      return setErrors(fieldErrors);
    }
    setErrors({});
    setBusy(true);
    const { error } = await authClient.signUp.email({
      ...parsed.data,
      callbackURL,
      fetchOptions: inviteToken ? { headers: { "x-invite-token": inviteToken } } : undefined,
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setRegistered(true);
  }

  if (registered) {
    return (
      <Alert kind="success">
        Fast geschafft! Wir haben dir eine Mail an <b>{form.email}</b> geschickt. Klicke auf den Link darin, um deine Adresse zu
        bestätigen. Danach bist du direkt angemeldet.
      </Alert>
    );
  }

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="Name" autoComplete="name" value={form.name} onChange={set("name")} error={errors.name} />
      <Field
        label="E-Mail"
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={set("email")}
        error={errors.email}
        readOnly={!!fixedEmail}
      />
      <Field
        label="Passwort"
        type="password"
        autoComplete="new-password"
        value={form.password}
        onChange={set("password")}
        error={errors.password}
      />
      <Button type="submit" disabled={busy} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
