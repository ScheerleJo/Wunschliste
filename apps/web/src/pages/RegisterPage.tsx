import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { signUpSchema } from "@wunschliste/shared";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { Alert, Button, Field } from "../components/ui.tsx";
import { authClient, authErrorMessage } from "../lib/auth-client.ts";

// TODO (Gruppen-Schritt): Registrierung nur noch über Einladungslink (/einladung/:token).
export function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
    const { error } = await authClient.signUp.email({ ...parsed.data, callbackURL: "/" });
    setBusy(false);
    if (error) return setError(authErrorMessage(error));
    setRegistered(true);
  }

  if (registered) {
    return (
      <AuthLayout title="Fast geschafft!">
        <Alert kind="success">
          Wir haben dir eine Mail an <b>{form.email}</b> geschickt. Klicke auf den Link darin, um deine Adresse zu bestätigen. Danach
          bist du direkt angemeldet.
        </Alert>
      </AuthLayout>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <AuthLayout title="Konto erstellen">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Name" autoComplete="name" value={form.name} onChange={set("name")} error={errors.name} />
        <Field label="E-Mail" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} />
        <Field
          label="Passwort"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          error={errors.password}
        />
        <Button type="submit" disabled={busy} className="w-full">
          Konto erstellen
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-stone-600">
        Schon ein Konto?{" "}
        <Link to="/anmelden" className="font-medium text-brand-700 hover:underline">
          Anmelden
        </Link>
      </p>
    </AuthLayout>
  );
}
