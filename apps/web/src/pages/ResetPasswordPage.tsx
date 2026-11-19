import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { Alert, Button, Field } from "../components/ui.tsx";
import { authClient, authErrorMessage } from "../lib/auth-client.ts";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Der Link ist ungültig oder abgelaufen." : null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) return setError(authErrorMessage(error));
    setDone(true);
  }

  return (
    <AuthLayout title="Neues Passwort festlegen">
      {done ? (
        <Alert kind="success">
          Dein Passwort wurde geändert.{" "}
          <Link to="/anmelden" className="font-medium underline">
            Jetzt anmelden
          </Link>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field
            label="Neues Passwort"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!token}>
            Passwort speichern
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
