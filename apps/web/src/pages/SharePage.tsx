import { useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APP_NAME, formatPrice, shareImageUrl, type GuestReservationDto, type ViewWishDto } from "@wunschliste/shared";
import { LinkChips } from "../components/LinkChips.tsx";
import { Alert, Badge, Button, Card, Spinner } from "../components/ui.tsx";
import { WishThumb } from "../components/WishThumb.tsx";
import { ApiError, guestApi } from "../lib/api.ts";
import { Icon, type IconName } from "../components/Icon.tsx";

/** Öffentliche Ansicht einer geteilten Wunschliste für Gäste ohne Konto */
export function SharePage() {
  const { token = "" } = useParams();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
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

  const { profile, wishes, myReservations } = view.data;
  const shown = onlyAvailable ? wishes.filter((w) => w.reservation !== "reserved") : wishes;
  // "geändert" steht schon an der Karte; nur Wünsche, die nicht mehr in der Liste sind, hier extra zeigen
  const notices = myReservations.filter((r) => r.state !== "ok" && (r.state !== "changed" || !wishes.some((w) => w.id === r.wishId)));

  return (
    <Shell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Wunschliste von {profile.displayName}</h1>
          <p className="mt-1 text-sm text-stone-600">
            Reserviere, was du schenken möchtest, damit nichts doppelt gekauft wird. {profile.displayName} sieht davon nichts. <Icon name="secret" className="ml-1" />
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Deine Reservierungen gehören zu diesem Link. Du siehst sie also auf jedem Gerät, auf dem du ihn öffnest. Gib den Link
            deshalb nicht weiter.
          </p>
        </div>

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
            <p className="text-4xl text-brand-700"><Icon name="empty" /></p>
            <p className="mt-2 text-sm text-stone-600">Hier stehen gerade keine Wünsche.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {shown.map((w) => (
              <li key={w.id}>
                <GuestWishCard wish={w} token={token} />
              </li>
            ))}
          </ul>
        )}
      </div>
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
  reserved_by_me: <Badge tone="brand"><Icon name="check" className="mr-1" />Von dir reserviert</Badge>,
};

function GuestWishCard({ wish, token }: { wish: ViewWishDto; token: string }) {
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
          <span className="flex-1"><Icon name="edit" className="mr-1.5" />Dieser Wunsch wurde seit deiner Reservierung geändert.</span>
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
        <div key={wish.reservation} className="mt-3 flex justify-end border-t border-stone-100 pt-3">
          {wish.reservation === "available" ? (
            <Button className="py-2!" disabled={reserve.isPending} onClick={() => reserve.mutate()}>
              <Icon name="reserve" /> Reservieren
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

const noticeIcon: Record<Exclude<GuestReservationDto["state"], "ok">, IconName> = { changed: "edit", archived: "archive", deleted: "delete" };

const noticeText: Record<Exclude<GuestReservationDto["state"], "ok">, string> = {
  changed: "wurde seit deiner Reservierung geändert.",
  archived: "wurde archiviert, ist vielleicht schon erfüllt.",
  deleted: "wurde von der Liste entfernt.",
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
        <Icon name={noticeIcon[r.state]} className="mr-1.5" />
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
