import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { GroupMemberDto, GroupSummaryDto } from "@wunschliste/shared";
import { Badge, Card, Spinner } from "../components/ui.tsx";
import { groupsApi, wishesApi } from "../lib/api.ts";
import { useMe } from "../lib/use-me.ts";
import { Icon } from "../components/Icon.tsx";

const OPEN_KEY = "wunschbaum.start.offen";

/** Aufgeklappte Gruppen im Browser merken (fällt still zurück, z. B. im privaten Modus) */
function useOpenGroups() {
  const [open, setOpen] = useState<string[] | null>(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return null;
    }
  });
  const toggle = (id: string, current: string[]) => {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* egal */
    }
  };
  return { open, toggle };
}

/** Startseite nach dem Anmelden: eigene Liste, Kinderlisten und alle Gruppen mit ihren Mitgliedern */
export function StartPage() {
  const { data: me } = useMe();
  const groups = useQuery({ queryKey: ["groups"], queryFn: groupsApi.list });
  const ownWishes = useQuery({
    queryKey: ["wishes", me?.profile.id, "active"],
    queryFn: () => wishesApi.list(me!.profile.id, "active"),
    enabled: !!me,
  });
  const { open, toggle } = useOpenGroups();

  if (!me || groups.isPending) return <Spinner />;
  // Ohne gespeicherte Auswahl: bei nur einer Gruppe diese aufklappen
  const openIds = open ?? (groups.data?.length === 1 ? [groups.data[0]!.id] : []);
  const count = ownWishes.data?.length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        Hallo {me.user.name} <Icon name="wave" className="ml-1 text-amber-500" />
      </h1>

      {/* Eigene Liste */}
      <Link
        to="/liste"
        className="group block rounded-2xl bg-gradient-to-br from-brand-700 to-brand-800 p-5 text-white shadow-sm transition hover:shadow-md sm:p-6"
      >
        <div className="flex items-center gap-4">
          <Icon name="gift" className="text-4xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">Meine Wunschliste</p>
            <p className="text-sm text-white/80">
              {count === undefined ? "Wünsche ansehen und bearbeiten" : count === 0 ? "Noch leer – trag deinen ersten Wunsch ein" : `${count} ${count === 1 ? "Wunsch" : "Wünsche"}`}
            </p>
          </div>
          <span className="text-2xl transition group-hover:translate-x-1" aria-hidden>
            <Icon name="forward" />
          </span>
        </div>
      </Link>

      {/* Listen der Kinder, die ich verwalte */}
      {me.managedProfiles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {me.managedProfiles.map((p) => (
            <Link
              key={p.id}
              to={`/liste?profil=${p.id}`}
              className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand-500/40 hover:shadow"
            >
              <Icon name="child" className="text-2xl text-brand-700" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Wunschliste von {p.displayName}</span>
                <span className="text-sm text-stone-500">von dir verwaltet</span>
              </span>
              <span className="text-stone-400" aria-hidden>
                <Icon name="forward" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Gruppen */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Deine Gruppen</h2>
        {groups.data?.length === 0 ? (
          <Card className="text-center">
            <p className="text-3xl text-brand-700"><Icon name="groups" /></p>
            <p className="mt-2 text-sm text-stone-600">
              Du bist noch in keiner Gruppe.{" "}
              <Link to="/gruppen" className="font-medium text-brand-700 hover:underline">
                Gruppe anlegen
              </Link>{" "}
              oder lass dir einen Einladungslink schicken.
            </p>
          </Card>
        ) : (
          groups.data?.map((g) => <GroupAccordion key={g.id} group={g} open={openIds.includes(g.id)} onToggle={() => toggle(g.id, openIds)} />)
        )}
      </section>
    </div>
  );
}

function GroupAccordion({ group, open, onToggle }: { group: GroupSummaryDto; open: boolean; onToggle: () => void }) {
  const detail = useQuery({ queryKey: ["groups", group.id], queryFn: () => groupsApi.get(group.id), enabled: open });
  const panelId = `gruppe-${group.id}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-stone-50"
      >
        <Icon name="groups" className="text-xl text-brand-700" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{group.name}</span>
          <span className="text-sm text-stone-500">
            {group.memberCount} {group.memberCount === 1 ? "Mitglied" : "Mitglieder"}
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="border-t border-stone-100">
          {detail.isPending ? (
            <p className="px-5 py-3 text-sm text-stone-500">Lädt …</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {detail.data?.members.map((m) => (
                <MemberRow key={m.profileId} m={m} />
              ))}
            </ul>
          )}
          <div className="border-t border-stone-100 px-5 py-2.5 text-right">
            <Link to={`/gruppen/${group.id}`} className="text-sm text-stone-500 hover:text-brand-700 hover:underline">
              Zur Gruppe (Einladen, Haushalte …) <Icon name="forward" className="ml-1" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ m }: { m: GroupMemberDto }) {
  return (
    <li>
      <Link to={m.isMe ? "/liste" : `/liste/${m.profileId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700">
          {m.displayName.charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="font-medium">{m.displayName}</span>
          {m.isMe && <Badge>Du</Badge>}
          {m.managed && <Badge tone="amber">Kind</Badge>}
        </span>
        <span className="shrink-0 text-sm font-medium text-brand-700">{m.isMe ? "Meine Liste" : "Wunschliste"} <Icon name="forward" className="ml-1" /></span>
      </Link>
    </li>
  );
}
