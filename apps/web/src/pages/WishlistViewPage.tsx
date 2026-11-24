import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBudget, formatPrice, type ViewWishDto } from "@wunschliste/shared";
import { LinkChips } from "../components/LinkChips.tsx";
import { WishThumb } from "../components/WishThumb.tsx";
import { Alert, Badge, Button, Card, Spinner } from "../components/ui.tsx";
import { eventsApi, reservationsApi } from "../lib/api.ts";
import { useMe } from "../lib/use-me.ts";

/** Wunschliste einer anderen Person aus Sicht der Schenkenden */
export function WishlistViewPage() {
  const { profileId = "" } = useParams();
  const { data: me } = useMe();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  // Aufruf aus einem Event (?event=…): Budget anzeigen und teurere Wünsche markieren
  const [params] = useSearchParams();
  const eventId = params.get("event");
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => eventsApi.get(eventId!), enabled: !!eventId, retry: false });
  const budgetMax = event.data?.budgetMaxCents ?? null;
  const list = useQuery({
    queryKey: ["wishlist-view", profileId],
    queryFn: () => reservationsApi.view(profileId),
    retry: false,
    enabled: !!me && me.profile.id !== profileId,
  });

  // Die eigene Liste gibt es nur in der Besitzer-Sicht (ohne Reservierungen)
  if (me && me.profile.id === profileId) return <Navigate to="/liste" replace />;
  if (list.isPending) return <Spinner />;
  if (list.isError || !list.data) {
    return (
      <Card>
        <p>Diese Wunschliste gibt es nicht oder ihr seid in keiner gemeinsamen Gruppe.</p>
        <Link to="/gruppen" className="mt-2 inline-block text-sm text-brand-700 hover:underline">
          ← Zu den Gruppen
        </Link>
      </Card>
    );
  }

  const { profile, sharedGroups, wishes } = list.data;
  const shown = onlyAvailable ? wishes.filter((w) => w.reservation !== "reserved") : wishes;
  const availableCount = wishes.filter((w) => w.reservation === "available").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Wunschliste von {profile.displayName}</h1>
        <p className="mt-1 text-sm text-stone-500">
          Über {sharedGroups.map((g) => g.name).join(", ")} · {wishes.length} {wishes.length === 1 ? "Wunsch" : "Wünsche"},{" "}
          {availableCount} verfügbar
        </p>
      </div>

      {event.data && formatBudget(event.data.budgetMinCents, event.data.budgetMaxCents) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <span>
            {event.data.type === "secret_santa" ? "🎅" : "🎁"} {event.data.name}: Budget{" "}
            <b>{formatBudget(event.data.budgetMinCents, event.data.budgetMaxCents)}</b>
          </span>
          <Link to={`/events/${event.data.id}`} className="font-medium underline">
            Zum Event
          </Link>
        </div>
      )}

      {profile.managed && (
        <Alert kind="success">
          Diese Liste wird von den Eltern verwaltet. Eltern sehen hier, was reserviert ist, damit ihr euch abstimmen könnt.
        </Alert>
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
          <p className="mt-2 text-sm text-stone-600">{profile.displayName} hat noch keine Wünsche eingetragen.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((w) => (
            <li key={w.id}>
              <ViewWishCard wish={w} profileId={profileId} overBudget={budgetMax !== null && w.priceCents !== null && w.priceCents > budgetMax} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const statusBadge = {
  available: <Badge tone="green">Verfügbar</Badge>,
  reserved: <Badge>Reserviert</Badge>,
  reserved_by_me: <Badge tone="brand">✓ Von dir reserviert</Badge>,
};

function ViewWishCard({ wish, profileId, overBudget }: { wish: ViewWishDto; profileId: string; overBudget?: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["wishlist-view", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["reservations"] }),
    ]);
  const onError = async (e: Error) => {
    setError(e.message);
    await refresh();
  };
  const reserve = useMutation({ mutationFn: () => reservationsApi.reserve(wish.id), onSuccess: refresh, onError });
  const release = useMutation({ mutationFn: () => reservationsApi.release(wish.id), onSuccess: refresh, onError });
  const ack = useMutation({ mutationFn: () => reservationsApi.acknowledge(wish.id), onSuccess: refresh, onError });
  const busy = reserve.isPending || release.isPending;
  const takenByOther = wish.reservation === "reserved";

  return (
    <Card className={`p-4! sm:p-5! ${takenByOther ? "bg-stone-50 opacity-70" : ""} ${wish.reservation === "reserved_by_me" ? "border-brand-500/40!" : ""}`}>
      <div className="flex gap-3">
        <WishThumb images={wish.images} title={wish.title} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className={`font-semibold break-words ${takenByOther ? "text-stone-500" : ""}`}>{wish.title}</h3>
              {wish.priceCents !== null && <span className="text-sm text-stone-600">ca. {formatPrice(wish.priceCents)}</span>}
              {overBudget && <Badge tone="amber">über Budget</Badge>}
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
        <div key={wish.reservation} className="mt-3 flex justify-end border-t border-stone-100 pt-3">
          {wish.reservation === "available" ? (
            <Button onClick={() => reserve.mutate()} disabled={busy} className="py-2!">
              🔖 Reservieren
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => confirm("Reservierung wirklich aufheben? Dann können andere den Wunsch wieder reservieren.") && release.mutate()}
              disabled={busy}
              className="py-2!"
            >
              Reservierung aufheben
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
