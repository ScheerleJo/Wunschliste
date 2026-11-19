import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { RegisterForm } from "../components/RegisterForm.tsx";
import { Alert, Button, Spinner } from "../components/ui.tsx";
import { ApiError, invitesApi } from "../lib/api.ts";
import { useMe } from "../lib/use-me.ts";

const reasons = {
  expired: "Diese Einladung ist abgelaufen.",
  revoked: "Diese Einladung wurde zurückgezogen.",
  used_up: "Diese Einladung wurde bereits verwendet.",
} as const;

export function InvitePage() {
  const { token = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useQuery({
    queryKey: ["invite", token, !!me.data],
    queryFn: () => invitesApi.preview(token),
    enabled: !me.isPending,
    retry: false,
  });

  if (me.isPending || preview.isPending) return <Spinner />;

  if (preview.isError || !preview.data) {
    return (
      <AuthLayout title="Einladung">
        <Alert>Diese Einladung gibt es nicht. Prüfe, ob der Link vollständig ist.</Alert>
      </AuthLayout>
    );
  }

  const inv = preview.data;
  const here = `/einladung/${token}`;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await invitesApi.accept(token);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      navigate(`/gruppen/${res.groupId}`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Beitritt fehlgeschlagen");
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={`Einladung zu „${inv.groupName}“`}>
      <p className="mb-4 text-sm text-stone-600">
        <b>{inv.invitedByName}</b> lädt dich in die Gruppe <b>{inv.groupName}</b> ein. Dort teilt ihr eure Wunschlisten und könnt
        Geschenke reservieren, ohne dass der Beschenkte es sieht.
      </p>

      {!inv.valid && !inv.alreadyMember ? (
        <Alert>{inv.reason ? reasons[inv.reason] : "Diese Einladung ist nicht mehr gültig."}</Alert>
      ) : me.data ? (
        inv.alreadyMember ? (
          <div className="space-y-3">
            <Alert kind="success">Du bist bereits Mitglied dieser Gruppe.</Alert>
            <Button className="w-full" onClick={accept}>
              Zur Gruppe
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {error && <Alert>{error}</Alert>}
            <p className="text-sm text-stone-600">
              Angemeldet als <b>{me.data.user.name}</b>.
            </p>
            <Button className="w-full" onClick={accept} disabled={busy}>
              Gruppe beitreten
            </Button>
          </div>
        )
      ) : (
        <>
          <div className="mb-4 rounded-lg bg-stone-50 p-3 text-sm">
            Du hast schon ein Konto?{" "}
            <Link to={`/anmelden?weiter=${encodeURIComponent(here)}`} className="font-medium text-brand-700 hover:underline">
              Anmelden und beitreten
            </Link>
          </div>
          <h3 className="mb-3 font-medium">Neues Konto erstellen</h3>
          <RegisterForm inviteToken={token} callbackURL={here} fixedEmail={inv.email} submitLabel="Konto erstellen" />
        </>
      )}
    </AuthLayout>
  );
}
