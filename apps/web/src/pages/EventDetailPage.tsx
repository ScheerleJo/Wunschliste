import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBudget, type EventAssignmentDto, type EventDetailDto, type EventInput } from "@wunschliste/shared";
import { Dialog } from "../components/Dialog.tsx";
import { EventForm, WichtelChoice } from "../components/EventForm.tsx";
import { Alert, Badge, Button, Card, Spinner } from "../components/ui.tsx";
import { eventsApi, groupsApi, householdsApi } from "../lib/api.ts";
import { formatDate } from "./EventsPage.tsx";

export function EventDetailPage() {
  const { eventId = "" } = useParams();
  const ev = useQuery({ queryKey: ["event", eventId], queryFn: () => eventsApi.get(eventId), retry: false });
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();

  if (ev.isPending) return <Spinner />;
  if (ev.isError || !ev.data) {
    return (
      <Card>
        <p>Dieses Event gibt es nicht oder du bist nicht in der Gruppe.</p>
        <Link to="/events" className="mt-2 inline-block text-sm text-brand-700 hover:underline">
          ← Zu den Events
        </Link>
      </Card>
    );
  }
  const e = ev.data;
  const budget = formatBudget(e.budgetMinCents, e.budgetMaxCents);
  const isSanta = e.type === "secret_santa";

  return (
    <div className="space-y-4">
      <Link to="/events" className="text-sm text-stone-500 hover:underline">
        ← Events
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {isSanta ? "🎅" : "🎄"} {e.name}
          </h1>
          <p className="mt-1 text-stone-600">
            <Link to={`/gruppen/${e.groupId}`} className="hover:underline">
              {e.groupName}
            </Link>
            {e.date && ` · ${formatDate(e.date)}`}
            {e.createdByName && <span className="text-stone-400"> · organisiert von {e.createdByName}</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="brand">{isSanta ? "Wichteln" : "Alle beschenken alle"}</Badge>
            {budget && <Badge>💶 Budget {budget}</Badge>}
          </div>
        </div>
        {e.canManage && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Bearbeiten
          </Button>
        )}
      </div>
      {e.description && <p className="whitespace-pre-line text-stone-700">{e.description}</p>}

      {e.reveals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">👀 Die Auslosung wurde von einem Organisator eingesehen:</p>
          <ul className="mt-1 list-disc pl-5">
            {e.reveals.map((r, i) => (
              <li key={i}>
                {new Date(r.at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} von {r.byName ?? "?"}
                {r.reason && `: „${r.reason}“`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isSanta ? <MyAssignments event={e} /> : <EveryoneList event={e} />}
      {isSanta && <Participants event={e} />}
      {e.canManage && <Organizer event={e} />}

      <Dialog open={editing} onClose={() => setEditing(false)} title="Event bearbeiten">
        <EditEvent event={e} onDone={async () => {
          await queryClient.invalidateQueries({ queryKey: ["event", e.id] });
          await queryClient.invalidateQueries({ queryKey: ["events"] });
          setEditing(false);
        }} onCancel={() => setEditing(false)} />
      </Dialog>
    </div>
  );
}

function EditEvent({ event, onDone, onCancel }: { event: EventDetailDto; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (input: EventInput) => eventsApi.update(event.id, input), onSuccess: onDone, onError: (e) => setError(e.message) });
  return (
    <>
      {error && <Alert>{error}</Alert>}
      <EventForm initial={event} busy={save.isPending} onSubmit={(_, input) => save.mutate(input)} onCancel={onCancel} />
    </>
  );
}

// ---------------------------------------------------------------------------

/** "Du beschenkst …" für mich und meine Kinder */
function MyAssignments({ event }: { event: EventDetailDto }) {
  if (event.status === "draft") {
    return (
      <Card className="text-center">
        <p className="text-4xl">🎁</p>
        <p className="mt-2 font-medium">Noch nicht ausgelost</p>
        <p className="mt-1 text-sm text-stone-600">
          {event.participating
            ? "Sobald ausgelost ist, siehst du hier, wen du beschenkst. Niemand sonst sieht es, auch der Organisator nicht."
            : "Du nimmst an diesem Wichteln nicht teil."}
        </p>
      </Card>
    );
  }
  if (event.myAssignments.length === 0) {
    return (
      <Card>
        <p className="text-sm text-stone-600">Du nimmst an diesem Wichteln nicht teil.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {event.myAssignments.map((a) => (
        <AssignmentCard key={a.giver.profileId} a={a} eventId={event.id} self={!event.participants.find((p) => p.profileId === a.giver.profileId)?.managed} />
      ))}
    </div>
  );
}

function AssignmentCard({ a, eventId, self }: { a: EventAssignmentDto; eventId: string; self: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <Card className="border-brand-500/30! bg-gradient-to-br from-brand-50 to-white">
      <p className="text-sm text-stone-600">{self ? "Du beschenkst" : `${a.giver.displayName} beschenkt`}</p>
      {shown ? (
        <>
          <p className="mt-1 text-3xl font-semibold text-brand-800">{a.receiver.displayName}</p>
          <Link to={`/liste/${a.receiver.profileId}?event=${eventId}`} className="mt-4 inline-block">
            <Button>🎁 Wunschliste von {a.receiver.displayName}</Button>
          </Link>
          <p className="mt-3 text-xs text-stone-500">Psst, nicht verraten! 🤫</p>
        </>
      ) : (
        <Button variant="secondary" className="mt-3" onClick={() => setShown(true)}>
          🎁 Aufdecken
        </Button>
      )}
    </Card>
  );
}

/** Standard-Event: alle Teilnehmenden mit Link zur Wunschliste */
function EveryoneList({ event }: { event: EventDetailDto }) {
  return (
    <Card className="p-0!">
      <h2 className="border-b border-stone-100 px-5 py-4 font-semibold">Wunschlisten ({event.participants.length})</h2>
      <ul className="divide-y divide-stone-100">
        {event.participants.map((p) => (
          <li key={p.profileId}>
            <Link to={`/liste/${p.profileId}?event=${event.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-stone-50">
              <span className="font-medium">
                {p.displayName} {p.managed && <Badge tone="amber">Kind</Badge>}
              </span>
              <span className="text-sm text-brand-700">Wunschliste →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Participants({ event }: { event: EventDetailDto }) {
  return (
    <Card>
      <h2 className="font-semibold">Teilnehmende ({event.participants.length})</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {event.participants.map((p) => (
          <Badge key={p.profileId}>
            {p.managed ? "👶 " : ""}
            {p.displayName}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Organizer({ event }: { event: EventDetailDto }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<EventAssignmentDto[] | null>(null);
  const group = useQuery({ queryKey: ["groups", event.groupId], queryFn: () => groupsApi.get(event.groupId) });
  const households = useQuery({ queryKey: ["households", event.groupId], queryFn: () => householdsApi.list(event.groupId) });
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ["event", event.id] }), queryClient.invalidateQueries({ queryKey: ["events"] })]);
  const onError = (e: Error) => {
    setInfo(null);
    setError(e.message);
  };
  const ok = (msg?: string) => async () => {
    setError(null);
    setInfo(msg ?? null);
    await refresh();
  };

  const setParticipants = useMutation({ mutationFn: (ids: string[]) => eventsApi.setParticipants(event.id, ids), onSuccess: ok(), onError });
  const setExclusions = useMutation({ mutationFn: (pairs: { a: string; b: string }[]) => eventsApi.setExclusions(event.id, pairs), onSuccess: ok(), onError });
  const drawIt = useMutation({
    mutationFn: () => eventsApi.draw(event.id),
    onSuccess: async (r) => {
      setRevealed(null);
      await ok(
        r.previousYearIgnored
          ? "Ausgelost! Hinweis: Die Paarungen vom letzten Mal ließen sich diesmal nicht vermeiden."
          : "Ausgelost! Alle Teilnehmenden sehen jetzt, wen sie beschenken.",
      )();
    },
    onError,
  });
  const setType = useMutation({
    mutationFn: (type: EventInput["type"]) => eventsApi.setType(event.id, type),
    onSuccess: async (_, type) => {
      setRevealed(null);
      await ok(type === "secret_santa" ? "Wichteln aktiviert. Prüfe Teilnehmende und Ausschlüsse und lose dann aus." : "Wichteln ausgeschaltet. Alle beschenken alle.")();
    },
    onError,
  });
  const reset = useMutation({ mutationFn: () => eventsApi.reset(event.id), onSuccess: ok("Auslosung zurückgesetzt."), onError });
  const reveal = useMutation({ mutationFn: (reason: string) => eventsApi.reveal(event.id, reason), onSuccess: async (r) => { setRevealed(r); await refresh(); }, onError });
  const remove = useMutation({
    mutationFn: () => eventsApi.remove(event.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate("/events", { replace: true });
    },
    onError,
  });

  const draft = event.status === "draft";
  const isSanta = event.type === "secret_santa";
  const members = group.data?.members ?? [];
  const participantIds = new Set(event.participants.map((p) => p.profileId));
  const nameOf = (id: string) => members.find((m) => m.profileId === id)?.displayName ?? event.participants.find((p) => p.profileId === id)?.displayName ?? "?";

  return (
    <Card className="border-dashed!">
      <h2 className="font-semibold">⚙️ Organisation</h2>
      <p className="mt-1 text-sm text-stone-600">Nur für Organisator und Gruppen-Admins sichtbar.</p>
      <div className="mt-3 space-y-2">
        {error && <Alert>{error}</Alert>}
        {info && <Alert kind="success">{info}</Alert>}
      </div>

      {/* Art: wird gewichtelt? */}
      <section className="mt-4">
        <h3 className="mb-1.5 text-sm font-medium text-stone-700">Wird gewichtelt?</h3>
        <WichtelChoice
          value={event.type}
          disabled={setType.isPending}
          onChange={(type) => {
            if (type === event.type) return;
            if (type === "standard" && event.status !== "draft" && !confirm("Wichteln ausschalten? Die bisherige Auslosung wird verworfen.")) return;
            setType.mutate(type);
          }}
        />
      </section>

      {/* Teilnehmende */}
      <section className="mt-4">
        <h3 className="text-sm font-medium text-stone-700">Wer macht mit?</h3>
        {!draft && <p className="text-xs text-stone-500">Zum Ändern die Auslosung erst zurücksetzen.</p>}
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {members.map((m) => (
            <label key={m.profileId} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-brand-700"
                disabled={!draft || setParticipants.isPending}
                checked={participantIds.has(m.profileId)}
                onChange={(ev) =>
                  setParticipants.mutate(
                    ev.target.checked ? [...participantIds, m.profileId] : [...participantIds].filter((id) => id !== m.profileId),
                  )
                }
              />
              {m.displayName} {m.managed && <Badge tone="amber">Kind</Badge>}
            </label>
          ))}
        </div>
      </section>

      {isSanta && (
        <section className="mt-5">
          <h3 className="text-sm font-medium text-stone-700">Wer darf sich nicht ziehen?</h3>
          <p className="text-xs text-stone-500">
            Haushalte gelten automatisch (
            <Link to={`/gruppen/${event.groupId}`} className="underline">
              in der Gruppe verwalten
            </Link>
            ). Zusätzlich wird vermieden, dass jemand dieselbe Person wie beim letzten Wichteln zieht.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {households.data?.map((h) => (
              <li key={h.id} className="rounded-lg bg-stone-50 px-3 py-1.5">
                🏠 {h.name}: {h.members.map((m) => m.displayName).join(", ")}
              </li>
            ))}
            {event.manualExclusions.map((x, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-1.5">
                <span>
                  🚫 {nameOf(x.a)} ↔ {nameOf(x.b)}
                </span>
                {draft && (
                  <button
                    className="text-xs text-brand-700 hover:underline"
                    onClick={() => setExclusions.mutate(event.manualExclusions.filter((_, j) => j !== i))}
                  >
                    Entfernen
                  </button>
                )}
              </li>
            ))}
          </ul>
          {draft && <AddExclusion event={event} onAdd={(a, b) => setExclusions.mutate([...event.manualExclusions, { a, b }])} />}
        </section>
      )}

      {/* Aktionen */}
      <section className="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        {isSanta && draft && (
          <Button onClick={() => drawIt.mutate()} disabled={drawIt.isPending}>
            🎲 Jetzt auslosen
          </Button>
        )}
        {isSanta && !draft && (
          <>
            <Button
              variant="secondary"
              onClick={() => confirm("Neu auslosen? Alle bekommen eine neue Zuordnung. Bitte allen Bescheid sagen!") && drawIt.mutate()}
              disabled={drawIt.isPending}
            >
              🎲 Neu auslosen
            </Button>
            <Button variant="secondary" onClick={() => confirm("Auslosung verwerfen, um Teilnehmende oder Ausschlüsse zu ändern?") && reset.mutate()}>
              Zurücksetzen
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const reason = prompt(
                  "Notfall-Einsicht: Du siehst danach, wer wen beschenkt. Das wird protokolliert und allen Teilnehmenden angezeigt.\n\nGrund:",
                );
                if (reason) reveal.mutate(reason);
              }}
            >
              👀 Notfall-Einsicht
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          className="text-brand-700!"
          onClick={() => confirm(`Event „${event.name}“ löschen?`) && remove.mutate()}
        >
          Event löschen
        </Button>
      </section>

      {revealed && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="mb-2 font-medium text-amber-900">Komplette Zuordnung (wird nicht gespeichert, nur jetzt sichtbar):</p>
          <ul className="space-y-0.5">
            {revealed.map((a) => (
              <li key={a.giver.profileId}>
                {a.giver.displayName} → <b>{a.receiver.displayName}</b>
              </li>
            ))}
          </ul>
          <button className="mt-2 text-xs underline" onClick={() => setRevealed(null)}>
            Wieder verbergen
          </button>
        </div>
      )}
    </Card>
  );
}

function AddExclusion({ event, onAdd }: { event: EventDetailDto; onAdd: (a: string, b: string) => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const select = (value: string, set: (v: string) => void) => (
    <select value={value} onChange={(e) => set(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm">
      <option value="">Person …</option>
      {event.participants.map((p) => (
        <option key={p.profileId} value={p.profileId}>
          {p.displayName}
        </option>
      ))}
    </select>
  );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {select(a, setA)}
      <span className="text-stone-400">↔</span>
      {select(b, setB)}
      <Button
        variant="secondary"
        className="py-2!"
        disabled={!a || !b || a === b}
        onClick={() => {
          onAdd(a, b);
          setA("");
          setB("");
        }}
      >
        Ausschließen
      </Button>
    </div>
  );
}
