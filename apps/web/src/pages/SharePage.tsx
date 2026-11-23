import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APP_NAME, formatPrice, shareImageUrl, type GuestReservationDto, type ViewWishDto } from "@wunschliste/shared";
import { Dialog } from "../components/Dialog.tsx";
import { LinkChips } from "../components/LinkChips.tsx";
import { Alert, Badge, Button, Card, Field, Spinner } from "../components/ui.tsx";
import { WishThumb } from "../components/WishThumb.tsx";
import { ApiError, guestApi, guestToken } from "../lib/api.ts";

/** Öffentliche Ansicht einer geteilten Wunschliste für Gäste ohne Konto */
export function SharePage() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<string | null>(null); // Wunsch, der nach der Namensangabe reserviert wird
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // Persönlicher Link (#gast=…) stellt die Gast-Identität auf einem anderen Gerät wieder her
  useEffect(() => {
    const m = window.location.hash.match(/gast=([\w-]+)/);
    if (m) {
      guestToken.set(token, m[1]!);
      history.replaceState(null, "", window.location.pathname);
      void queryClient.invalidateQueries({ queryKey: ["share", token] });
    }
  }, [token, queryClient]);

  const view = useQuery({ queryKey: ["share", token], queryFn: () => guestApi.view(token), retry: false });

  if (view.isPending) return <Spinner />;
  if (view.isError || !view.data) {
    const msg = view.error instanceof ApiError && view.error.status === 403 ? view.error.message : "Dieser Link ist ungültig oder wurde zurückgezogen.";
    return (
      <Shell>
        <Card>
          <p>{msg}</p>
        </Card>
      </Shell>
    );
  }

  const { profile, wishes, guest, myReservations } = view.data;
  const shown = onlyAvailable ? wishes.filter((w) => w.reservation !== "reserved") : wishes;
  // "geändert" steht schon an der Karte; nur Wünsche, die nicht mehr in der Liste sind, hier extra zeigen
  const notices = myReservations.filter((r) => r.state !== "ok" && (r.state !== "changed" || !wishes.some((w) => w.id === r.wishId)));

  return (
    <Shell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Wunschliste von {profile.displayName}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {guest ? (
              <>
                Hallo {guest.name}! Reserviere, was du schenken möchtest. {profile.displayName} sieht davon nichts.
              </>
            ) : (
              <>Du kannst Wünsche reservieren, damit nichts doppelt geschenkt wird. {profile.displayName} sieht davon nichts. 🤫</>
            )}
          </p>
        </div>

        {guest && <PersonalLink token={token} />}

        {notices.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">Hinweise zu deinen Reservierungen</h2>
            {notices.map((r) => (
              <NoticeCard key={r.wishId} r={r} token={token} />
            ))}
          </section>
        )}

        {wishes.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" className="accent-brand-700" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
            Bereits reservierte Wünsche ausblenden
          </label>
        )}

        {wishes.length === 0 ? (
          <Card className="text-center">
            <p className="text-4xl">🎈</p>
            <p className="mt-2 text-sm text-stone-600">Hier stehen gerade keine Wünsche.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {shown.map((w) => (
              <li key={w.id}>
                <GuestWishCard wish={w} token={token} identified={!!guest} onNeedName={() => setAsking(w.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <NameDialog token={token} wishId={asking} onClose={() => setAsking(null)} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 font-semibold">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          {APP_NAME}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}

const statusBadge = {
  available: <Badge tone="green">Verfügbar</Badge>,
  reserved: <Badge>Reserviert</Badge>,
  reserved_by_me: <Badge tone="brand">✓ Von dir reserviert</Badge>,
};

function GuestWishCard({ wish, token, identified, onNeedName }: { wish: ViewWishDto; token: string; identified: boolean; onNeedName: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["share", token] });
  const onError = async (e: Error) => {
    setError(e.message);
    await refresh();
  };
  const reserve = useMutation({ mutationFn: () => guestApi.reserve(token, wish.id), onSuccess: refresh, onError });
  const release = useMutation({ mutationFn: () => guestApi.release(token, wish.id), onSuccess: refresh, onError });
  const ack = useMutation({ mutationFn: () => guestApi.acknowledge(token, wish.id), onSuccess: refresh, onError });
  const takenByOther = wish.reservation === "reserved";

  return (
    <Card className={`p-4! sm:p-5! ${takenByOther ? "bg-stone-50 opacity-70" : ""} ${wish.reservation === "reserved_by_me" ? "border-brand-500/40!" : ""}`}>
      <div className="flex gap-3">
        <WishThumb images={wish.images} title={wish.title} src={(id, size) => shareImageUrl(token, id, size)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className={`font-semibold break-words ${takenByOther ? "text-stone-500" : ""}`}>{wish.title}</h3>
              {wish.priceCents !== null && <span className="text-sm text-stone-600">ca. {formatPrice(wish.priceCents)}</span>}
            </div>
            {statusBadge[wish.reservation]}
          </div>
          {wish.description && <p className="mt-1 text-sm whitespace-pre-line text-stone-600">{wish.description}</p>}
          <LinkChips links={wish.links} />
        </div>
      </div>
      {wish.changedSinceReservation && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">✏️ Dieser Wunsch wurde seit deiner Reservierung geändert.</span>
          <button onClick={() => ack.mutate()} className="font-medium underline">
            Gesehen
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {!takenByOther && (
        <div className="mt-3 flex justify-end border-t border-stone-100 pt-3">
          {wish.reservation === "available" ? (
            <Button className="py-2!" disabled={reserve.isPending} onClick={() => (identified ? reserve.mutate() : onNeedName())}>
              🔖 Reservieren
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="py-2!"
              disabled={release.isPending}
              onClick={() => confirm("Reservierung wirklich aufheben?") && release.mutate()}
            >
              Reservierung aufheben
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/** Erstes Reservieren: Name abfragen, Gast anlegen, dann direkt reservieren */
function NameDialog({ token, wishId, onClose }: { token: string; wishId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Bitte gib deinen Namen an");
    setBusy(true);
    try {
      const res = await guestApi.join(token, name.trim());
      guestToken.set(token, res.guestToken);
      if (wishId) await guestApi.reserve(token, wishId);
      await queryClient.invalidateQueries({ queryKey: ["share", token] });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={wishId !== null} onClose={onClose} title="Wer bist du?">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-600">
          Damit du deine Reservierungen später wiederfindest und ändern kannst. Dein Name wird niemandem angezeigt, auch nicht der
          Familie. Ein Konto brauchst du nicht.
        </p>
        {error && <Alert>{error}</Alert>}
        <Field label="Dein Name" placeholder="z. B. Onkel Peter" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy}>
            Weiter und reservieren
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Persönlicher Link mit dem Gast-Schlüssel, um auf anderen Geräten weiterzumachen */
function PersonalLink({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const secret = guestToken.get(token);
  if (!secret) return null;
  const url = `${window.location.origin}/teilen/${token}#gast=${secret}`;
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
      <button className="font-medium text-brand-700 hover:underline" onClick={() => setOpen(!open)}>
        📌 Auf einem anderen Gerät weitermachen?
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-stone-600">
            Dieser Browser merkt sich deine Reservierungen. Mit deinem persönlichen Link findest du sie auch auf einem anderen Gerät.
            Behalte ihn für dich, z. B. als Lesezeichen.
          </p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-stone-100 px-2 py-1.5 text-xs">{url}</code>
            <Button
              variant="secondary"
              className="px-2.5! py-1.5! text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? "Kopiert ✓" : "Kopieren"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const noticeText: Record<Exclude<GuestReservationDto["state"], "ok">, string> = {
  changed: "✏️ wurde seit deiner Reservierung geändert.",
  archived: "📦 wurde archiviert, ist vielleicht schon erfüllt.",
  deleted: "🗑 wurde von der Liste entfernt.",
};

function NoticeCard({ r, token }: { r: GuestReservationDto; token: string }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["share", token] });
  const release = useMutation({ mutationFn: () => guestApi.release(token, r.wishId), onSuccess: refresh });
  const ack = useMutation({ mutationFn: () => guestApi.acknowledge(token, r.wishId), onSuccess: refresh });
  if (r.state === "ok") return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="flex-1">
        <b>{r.title}</b> {noticeText[r.state]}
      </span>
      {r.state === "changed" ? (
        <button className="font-medium underline" onClick={() => ack.mutate()}>
          Gesehen
        </button>
      ) : (
        <button className="font-medium underline" onClick={() => release.mutate()}>
          {r.state === "deleted" ? "Entfernen" : "Reservierung aufheben"}
        </button>
      )}
    </div>
  );
}
