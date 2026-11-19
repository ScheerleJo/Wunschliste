import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { Alert, Button, Field } from "../components/ui.tsx";
import { authClient, authErrorMessage } from "../lib/auth-client.ts";

export function LoginPage() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (mode === "password") {
      const { error } = await authClient.signIn.email({ email, password });
      setBusy(false);
      if (error) return setError(authErrorMessage(error));
      await queryClient.invalidateQueries();
      navigate("/");
    } else {
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
      setBusy(false);
      if (error) return setError(authErrorMessage(error));
      setMagicSent(true);
    }
  }

  return (
    <AuthLayout title="Anmelden">
      <div className="mb-4 grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm">
        {(["password", "magic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setMagicSent(false);
            }}
            className={`rounded-md py-1.5 font-medium ${mode === m ? "bg-white shadow-sm" : "text-stone-500"}`}
          >
            {m === "password" ? "Mit Passwort" : "Per Mail-Link"}
          </button>
        ))}
      </div>

      {magicSent ? (
        <Alert kind="success">
          Falls es ein Konto zu <b>{email}</b> gibt, haben wir dir einen Anmeldelink geschickt. Er ist 15 Minuten gültig.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="E-Mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === "password" && (
            <Field
              label="Passwort"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {mode === "password" ? "Anmelden" : "Anmeldelink schicken"}
          </Button>
        </form>
      )}

      <div className="mt-5 flex justify-between text-sm">
        <Link to="/passwort-vergessen" className="text-stone-600 hover:underline">
          Passwort vergessen?
        </Link>
        <Link to="/registrieren" className="font-medium text-brand-700 hover:underline">
          Konto erstellen
        </Link>
      </div>
    </AuthLayout>
  );
}
