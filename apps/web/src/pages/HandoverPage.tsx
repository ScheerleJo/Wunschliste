import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { RegisterForm } from "../components/RegisterForm.tsx";
import { Alert, Button, Spinner } from "../components/ui.tsx";
import { ApiError, childrenApi } from "../lib/api.ts";
import { useMe } from "../lib/use-me.ts";

/** Übernahme eines Kinderprofils durch das Kind selbst */
export function HandoverPage() {
  const { token = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useQuery({ queryKey: ["handover", token], queryFn: () => childrenApi.handoverPreview(token), retry: false });

  if (me.isPending || preview.isPending) return <Spinner />;
  if (preview.isError || !preview.data) {
    return (
      <AuthLayout title="Wunschliste übernehmen">
        <Alert>Diesen Übergabelink gibt es nicht. Prüfe, ob er vollständig ist.</Alert>
      </AuthLayout>
    );
  }
  const h = preview.data;
  const here = `/uebergabe/${token}`;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await childrenApi.acceptHandover(token);
      await queryClient.invalidateQueries();
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Übernahme fehlgeschlagen");
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={`Hallo ${h.childName}!`}>
      <p className="mb-4 text-sm text-stone-600">
        {h.guardianNames.join(" und ")} {h.guardianNames.length > 1 ? "übergeben" : "übergibt"} dir deine Wunschliste
        {h.wishCount > 0 && ` mit ${h.wishCount} ${h.wishCount === 1 ? "Wunsch" : "Wünschen"}`}. Ab jetzt verwaltest du sie selbst.
      </p>

      {!h.valid ? (
        <Alert>Dieser Übergabelink ist nicht mehr gültig. Bitte frag nach einem neuen.</Alert>
      ) : me.data ? (
        <div className="space-y-3">
          {error && <Alert>{error}</Alert>}
          <p className="text-sm text-stone-600">
            Angemeldet als <b>{me.data.user.email}</b>.
            {me.data.user.email.toLowerCase() !== h.email && " Die Übergabe gilt aber für eine andere Adresse."}
          </p>
          <Button className="w-full" onClick={accept} disabled={busy}>
            Wunschliste übernehmen
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg bg-stone-50 p-3 text-sm">
            Du hast schon ein Konto?{" "}
            <Link to={`/anmelden?weiter=${encodeURIComponent(here)}`} className="font-medium text-brand-700 hover:underline">
              Anmelden und übernehmen
            </Link>
          </div>
          <h3 className="mb-3 font-medium">Eigenes Konto erstellen</h3>
          <RegisterForm handoverToken={token} callbackURL={here} fixedEmail={h.email} />
        </>
      )}
    </AuthLayout>
  );
}
