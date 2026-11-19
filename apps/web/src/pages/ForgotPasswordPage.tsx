import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { Alert, Button, Field } from "../components/ui.tsx";
import { authClient, authErrorMessage } from "../lib/auth-client.ts";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/passwort-zuruecksetzen" });
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  }

  return (
    <AuthLayout title="Passwort vergessen">
      {sent ? (
        <Alert kind="success">Falls es ein Konto zu {email} gibt, haben wir dir einen Link zum Zurücksetzen geschickt.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="E-Mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full">
            Link anfordern
          </Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm">
        <Link to="/anmelden" className="text-stone-600 hover:underline">
          Zurück zur Anmeldung
        </Link>
      </p>
    </AuthLayout>
  );
}
