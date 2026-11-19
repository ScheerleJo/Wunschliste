import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBudget, type EventInput, type EventSummaryDto } from "@wunschliste/shared";
import { Dialog } from "../components/Dialog.tsx";
import { EventForm } from "../components/EventForm.tsx";
import { Alert, Badge, Button, Card, Spinner } from "../components/ui.tsx";
import { eventsApi, groupsApi } from "../lib/api.ts";

export const formatDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

export function EventsPage() {
  const events = useQuery({ queryKey: ["events"], queryFn: eventsApi.list });
  const groups = useQuery({ queryKey: ["groups"], queryFn: groupsApi.list });
  const [params, setParams] = useSearchParams();
  const creating = params.has("neu");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: EventInput }) => eventsApi.create(groupId, input),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/events/${id}`);
    },
    onError: (e) => setError(e.message),
  });

  if (events.isPending) return <Spinner />;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.data?.filter((e) => !e.date || e.date >= today) ?? [];
  const past = events.data?.filter((e) => e.date && e.date < today) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Events</h1>
        {groups.data && groups.data.length > 0 && <Button onClick={() => setParams({ neu: "" })}>+ Neues Event</Button>}
      </div>

      {events.data?.length === 0 ? (
        <Card className="text-center">
          <p className="text-4xl">🎄</p>
          <h2 className="mt-2 font-semibold">Noch keine Events</h2>
          <p className="mt-1 text-sm text-stone-600">
            {groups.data?.length
              ? "Plane ein Wichteln oder ein Fest, bei dem sich alle beschenken, mit Budget und Datum."
              : "Tritt zuerst einer Gruppe bei oder lege eine an."}
          </p>
        </Card>
      ) : (
        <>
          <EventList events={upcoming} />
          {past.length > 0 && (
            <>
              <h2 className="pt-2 text-sm font-medium text-stone-500">Vergangen</h2>
              <EventList events={past} muted />
            </>
          )}
        </>
      )}

      <Dialog open={creating} onClose={() => setParams({})} title="Neues Event">
        {error && <Alert>{error}</Alert>}
        <EventForm
          defaultGroupId={params.get("gruppe") ?? undefined}
          busy={create.isPending}
          onSubmit={(groupId, input) => create.mutate({ groupId, input })}
          onCancel={() => setParams({})}
        />
      </Dialog>
    </div>
  );
}

function EventList({ events, muted }: { events: EventSummaryDto[]; muted?: boolean }) {
  return (
    <ul className={`grid gap-3 sm:grid-cols-2 ${muted ? "opacity-70" : ""}`}>
      {events.map((e) => (
        <li key={e.id}>
          <Link
            to={`/events/${e.id}`}
            className="block h-full rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-brand-500/40 hover:shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">
                {e.type === "secret_santa" ? "🎅" : "🎄"} {e.name}
              </h3>
              {e.type === "secret_santa" &&
                (e.status === "draft" ? <Badge tone="amber">Noch nicht ausgelost</Badge> : <Badge tone="green">Ausgelost</Badge>)}
            </div>
            <p className="mt-1 text-sm text-stone-600">
              {e.groupName}
              {e.date && ` · ${formatDate(e.date)}`}
            </p>
            <p className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
              {formatBudget(e.budgetMinCents, e.budgetMaxCents) && <Badge>💶 {formatBudget(e.budgetMinCents, e.budgetMaxCents)}</Badge>}
              <Badge>👥 {e.participantCount}</Badge>
              {e.participating && <Badge tone="brand">Du nimmst teil</Badge>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
