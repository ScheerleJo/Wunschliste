import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPrice, type MyReservationDto } from "@wunschliste/shared";
import { LinkChips } from "../components/LinkChips.tsx";
import { Card, Spinner } from "../components/ui.tsx";
import { reservationsApi } from "../lib/api.ts";

const notices: Record<Exclude<MyReservationDto["state"], "ok">, { text: string; tone: string }> = {
  changed: { text: "✏️ Wurde seit deiner Reservierung geändert.", tone: "bg-amber-50 text-amber-800" },
  archived: { text: "📦 Hat der Wünschende archiviert, wahrscheinlich schon erfüllt.", tone: "bg-stone-100 text-stone-700" },
  deleted: { text: "🗑 Hat der Wünschende von der Liste gelöscht.", tone: "bg-brand-50 text-brand-800" },
  no_access: { text: "🔒 Du siehst diese Liste nicht mehr (keine gemeinsame Gruppe).", tone: "bg-stone-100 text-stone-700" },
};

/** "Was muss ich noch besorgen?" – alle eigenen Reservierungen, nach Person gruppiert */
export function ReservationsPage() {
  const list = useQuery({ queryKey: ["reservations"], queryFn: reservationsApi.mine });
  if (list.isPending) return <Spinner />;

  const byPerson = new Map<string, { name: string; items: MyReservationDto[] }>();
  for (const r of list.data ?? []) {
    const entry = byPerson.get(r.profile.id) ?? { name: r.profile.displayName, items: [] };
    entry.items.push(r);
    byPerson.set(r.profile.id, entry);
  }
  const total = (list.data ?? []).filter((r) => r.state === "ok" || r.state === "changed").reduce((s, r) => s + (r.priceCents ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Meine Reservierungen</h1>
        {list.data && list.data.length > 0 && (
          <p className="mt-1 text-sm text-stone-500">
            {list.data.length} {list.data.length === 1 ? "Geschenk" : "Geschenke"}
            {total > 0 && ` · zusammen ca. ${formatPrice(total)}`}
          </p>
        )}
      </div>

      {list.data?.length === 0 ? (
        <Card className="text-center">
          <p className="text-4xl">🔖</p>
          <h2 className="mt-2 font-semibold">Noch nichts reserviert</h2>
          <p className="mt-1 text-sm text-stone-600">
            Schau dir in deinen <Link to="/gruppen" className="text-brand-700 hover:underline">Gruppen</Link> die Wunschlisten der
            anderen an und reserviere, was du schenken möchtest.
          </p>
        </Card>
      ) : (
        [...byPerson.entries()].map(([profileId, { name, items }]) => (
          <section key={profileId} className="space-y-2">
            <h2 className="flex items-baseline justify-between font-semibold">
              <span>Für {name}</span>
              <Link to={`/liste/${profileId}`} className="text-sm font-normal text-brand-700 hover:underline">
                Liste ansehen →
              </Link>
            </h2>
            <ul className="space-y-2">
              {items.map((r) => (
                <li key={r.wishId}>
                  <ReservationCard r={r} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ReservationCard({ r }: { r: MyReservationDto }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reservations"] });
  const release = useMutation({ mutationFn: () => reservationsApi.release(r.wishId), onSuccess: refresh });
  const ack = useMutation({ mutationFn: () => reservationsApi.acknowledge(r.wishId), onSuccess: refresh });
  const notice = r.state !== "ok" ? notices[r.state] : null;

  return (
    <Card className="p-4!">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={`font-semibold ${r.state === "deleted" ? "text-stone-500 line-through" : ""}`}>{r.title}</h3>
        {r.priceCents !== null && <span className="text-sm text-stone-600">ca. {formatPrice(r.priceCents)}</span>}
      </div>
      <LinkChips links={r.links} />
      {notice && (
        <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${notice.tone}`}>
          <span className="flex-1">{notice.text}</span>
          {r.state === "changed" && (
            <button onClick={() => ack.mutate()} className="font-medium underline">
              Gesehen
            </button>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500">
        <span>reserviert am {new Date(r.reservedAt).toLocaleDateString("de-DE")}</span>
        <button
          className="rounded-lg px-2.5 py-1.5 font-medium text-brand-700 hover:bg-stone-100"
          onClick={() =>
            (r.state === "deleted" || confirm("Reservierung wirklich aufheben? Dann können andere den Wunsch wieder reservieren.")) &&
            release.mutate()
          }
        >
          {r.state === "deleted" ? "Entfernen" : "Reservierung aufheben"}
        </button>
      </div>
    </Card>
  );
}
