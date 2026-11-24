/**
 * System-Administration unter /admin (nirgends verlinkt).
 * Eigene Anmeldung mit separatem Admin-Konto. Zeigt bewusst keine Reservierungen und keine Wichtel-Zuordnungen.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APP_NAME, type AdminGroupDto, type AdminUserDto } from "@wunschliste/shared";
import { Alert, Badge, Button, Card, Field, Spinner } from "../components/ui.tsx";
import { adminApi, ApiError } from "../lib/api.ts";
import { Icon } from "../components/Icon.tsx";

const tabs = [
  ["uebersicht", "Übersicht"],
  ["benutzer", "Benutzer"],
  ["gruppen", "Gruppen"],
  ["kinder", "Kinder"],
  ["events", "Events"],
  ["links", "Einladungen & Links"],
] as const;
type Tab = (typeof tabs)[number][0];

/** Abmeldung nach 10 Minuten ohne Klick oder Tastatureingabe (der Server hat zusätzlich 1 Minute Puffer) */
const IDLE_MS = 10 * 60_000;
/** Aktivität höchstens alle 30 Sekunden an den Server melden, damit die Sitzung dort ebenfalls verlängert wird */
const PING_EVERY_MS = 30_000;
const TIMEOUT_FLAG = "wunschbaum.admin.timeout";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "–");

export function AdminPage() {
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminApi.me, retry: false });
  if (me.isPending) return <Spinner />;
  if (me.isError) return <AdminLogin />;
  return <AdminShell email={me.data.email} />;
}

// ---------------------------------------------------------------------------

function AdminLogin() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [timedOut] = useState(() => {
    try {
      const flag = sessionStorage.getItem(TIMEOUT_FLAG);
      sessionStorage.removeItem(TIMEOUT_FLAG);
      return !!flag;
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(email, password);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-12 w-12" />
          <h1 className="text-xl font-semibold">{APP_NAME} · Administration</h1>
        </div>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            {timedOut && !error && <Alert kind="success">Du wurdest nach 10 Minuten ohne Aktivität automatisch abgemeldet.</Alert>}
            {error && <Alert>{error}</Alert>}
            <Field label="Admin-E-Mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field
              label="Passwort"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              Anmelden
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function AdminShell({ email }: { email: string }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "uebersicht";
  const queryClient = useQueryClient();
  const logout = useMutation({ mutationFn: adminApi.logout, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }) });

  return (
    <div className="min-h-dvh">
      <header className="bg-stone-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold">{APP_NAME} · Administration</span>
          <span className="ml-auto text-sm text-stone-400">{email}</span>
          <IdleTimer
            onTimeout={() => {
              try {
                sessionStorage.setItem(TIMEOUT_FLAG, "1");
              } catch {
                /* egal */
              }
              logout.mutate();
            }}
          />
          <button onClick={() => logout.mutate()} className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">
            Abmelden
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setParams({ tab: key })}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium ${tab === key ? "bg-stone-50 text-stone-900" : "text-stone-300 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="mb-4 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
          <Icon name="secret" className="mr-1" />Reservierungen und Wichtel-Zuordnungen werden hier bewusst nicht angezeigt, damit die Überraschung auch für dich bleibt.
        </p>
        {tab === "uebersicht" && <Overview />}
        {tab === "benutzer" && <Users />}
        {tab === "gruppen" && <Groups />}
        {tab === "kinder" && <Children />}
        {tab === "events" && <Events />}
        {tab === "links" && <Links />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Mutation mit gemeinsamer Fehleranzeige und Neuladen aller Admin-Daten */
function useAdminAction() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    await queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
  return { run, error };
}

function Section({ title, children, error }: { title: string; children: ReactNode; error?: string | null }) {
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {error && <Alert>{error}</Alert>}
      {children}
    </section>
  );
}

const small = "px-2! py-1! text-xs";

// ---- Übersicht ----

function Overview() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: adminApi.stats });
  if (!stats.data) return <Spinner />;
  const s = stats.data;
  const tiles: [string, number, string?][] = [
    ["Benutzer", s.users, s.unverifiedUsers ? `${s.unverifiedUsers} unbestätigt` : undefined],
    ["Kinderprofile", s.childProfiles],
    ["Gruppen", s.groups],
    ["Aktive Wünsche", s.activeWishes],
    ["Kommende Events", s.upcomingEvents],
    ["Aktive Einladungen", s.activeInvites],
    ["Aktive Teilen-Links", s.activeShareLinks],
  ];
  return (
    <Section title="Übersicht">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <Card key={label} className="p-4!">
            <p className="text-sm text-stone-500">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
            {hint && <p className="text-xs text-amber-700">{hint}</p>}
          </Card>
        ))}
      </div>
      <Card className="p-4! text-sm">
        <p className="font-medium"><Icon name="mail" className="mr-1.5" />Mailversand</p>
        <p className="mt-1 text-stone-600">
          {s.mail.configured ? (
            <>
              über <code>{s.mail.host}</code>, Absender <code>{s.mail.from}</code>
            </>
          ) : (
            "Kein SMTP_HOST gesetzt: Mails werden nur in der Server-Konsole ausgegeben."
          )}
        </p>
      </Card>
    </Section>
  );
}

// ---- Benutzer ----

function Users() {
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });
  const { run, error } = useAdminAction();
  const [filter, setFilter] = useState("");
  if (!users.data) return <Spinner />;
  const shown = users.data.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Section title={`Benutzer (${users.data.length})`} error={error}>
      <input
        placeholder="Suchen …"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 sm:w-72"
      />
      <ul className="space-y-2">
        {shown.map((u) => (
          <UserRow key={u.id} u={u} run={run} />
        ))}
      </ul>
    </Section>
  );
}

function UserRow({ u, run }: { u: AdminUserDto; run: ReturnType<typeof useAdminAction>["run"] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(u.name);
  const [email, setEmail] = useState(u.email);
  return (
    <Card className="p-4!">
      {editing ? (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => adminApi.updateUser(u.id, { name, email })).then(() => setEditing(false));
          }}
        >
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="E-Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex items-end gap-1">
            <Button type="submit">Speichern</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {u.name} {!u.emailVerified && <Badge tone="amber">unbestätigt</Badge>}
            </p>
            <p className="text-sm text-stone-600">{u.email}</p>
            <p className="mt-1 text-xs text-stone-500">
              seit {fmt(u.createdAt)} · zuletzt aktiv {fmt(u.lastActiveAt)} · {u.wishCount} Wünsche
              {u.groups.length > 0 && ` · ${u.groups.map((g) => `${g.name}${g.role === "admin" ? " (Admin)" : ""}`).join(", ")}`}
              {u.children.length > 0 && ` · verwaltet ${u.children.map((k) => k.displayName).join(", ")}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button variant="secondary" className={small} onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
            {!u.emailVerified && (
              <Button variant="secondary" className={small} onClick={() => run(() => adminApi.updateUser(u.id, { emailVerified: true }))}>
                Als bestätigt markieren
              </Button>
            )}
            <Button
              variant="secondary"
              className={small}
              onClick={() => {
                const pw = prompt(`Neues Passwort für ${u.name} (mind. 8 Zeichen). Alle Sitzungen werden beendet.`);
                if (pw) void run(() => adminApi.setPassword(u.id, pw));
              }}
            >
              Passwort setzen
            </Button>
            <Button variant="ghost" className={small} onClick={() => run(() => adminApi.logoutUser(u.id), `${u.name} überall abmelden?`)}>
              Abmelden
            </Button>
            <Button
              variant="ghost"
              className={`${small} text-brand-700!`}
              onClick={() =>
                run(
                  () => adminApi.deleteUser(u.id),
                  `${u.name} endgültig löschen? Wunschliste, Bilder, Gruppenmitgliedschaften und eigene Reservierungen werden entfernt.`,
                )
              }
            >
              Löschen
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---- Gruppen ----

function Groups() {
  const groups = useQuery({ queryKey: ["admin", "groups"], queryFn: adminApi.groups });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });
  const children = useQuery({ queryKey: ["admin", "children"], queryFn: adminApi.children });
  const { run, error } = useAdminAction();
  if (!groups.data) return <Spinner />;
  const people = [
    ...(users.data ?? []).filter((u) => u.profileId).map((u) => ({ profileId: u.profileId!, label: `${u.name} (${u.email})` })),
    ...(children.data ?? []).map((k) => ({ profileId: k.id, label: `${k.displayName} (Kind)` })),
  ];
  return (
    <Section title={`Gruppen (${groups.data.length})`} error={error}>
      <ul className="space-y-3">
        {groups.data.map((g) => (
          <GroupCard key={g.id} g={g} people={people} run={run} />
        ))}
      </ul>
    </Section>
  );
}

function GroupCard({ g, people, run }: { g: AdminGroupDto; people: { profileId: string; label: string }[]; run: ReturnType<typeof useAdminAction>["run"] }) {
  const [add, setAdd] = useState("");
  const noAdmin = !g.members.some((m) => m.role === "admin");
  const candidates = people.filter((p) => !g.members.some((m) => m.profileId === p.profileId));
  return (
    <Card className="p-4!">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {g.name} {noAdmin && <Badge tone="amber">kein Admin</Badge>}
          </p>
          <p className="text-xs text-stone-500">
            seit {fmt(g.createdAt)} · {g.members.length} Mitglieder · {g.eventCount} Events
          </p>
        </div>
        <Button
          variant="secondary"
          className={small}
          onClick={() => {
            const name = prompt("Neuer Name der Gruppe:", g.name);
            if (name?.trim()) void run(() => adminApi.updateGroup(g.id, name.trim(), g.description));
          }}
        >
          Umbenennen
        </Button>
        <Button
          variant="ghost"
          className={`${small} text-brand-700!`}
          onClick={() => run(() => adminApi.deleteGroup(g.id), `Gruppe „${g.name}“ für alle löschen? Wunschlisten bleiben erhalten.`)}
        >
          Löschen
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-stone-100 text-sm">
        {g.members.map((m) => (
          <li key={m.profileId} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="flex-1">
              {m.displayName} {m.role === "admin" && <Badge tone="brand">Admin</Badge>} {m.managed && <Badge tone="amber">Kind</Badge>}
            </span>
            {!m.managed && (
              <button
                className="text-xs text-stone-600 hover:underline"
                onClick={() => run(() => adminApi.setMember(g.id, m.profileId, m.role === "admin" ? "member" : "admin"))}
              >
                {m.role === "admin" ? "Admin entziehen" : "Zum Admin machen"}
              </button>
            )}
            <button
              className="text-xs text-brand-700 hover:underline"
              onClick={() => run(() => adminApi.removeMember(g.id, m.profileId), `${m.displayName} aus „${g.name}“ entfernen?`)}
            >
              Entfernen
            </button>
          </li>
        ))}
      </ul>
      {candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={add} onChange={(e) => setAdd(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Person hinzufügen …</option>
            {candidates.map((p) => (
              <option key={p.profileId} value={p.profileId}>
                {p.label}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            className={small}
            disabled={!add}
            onClick={() => {
              void run(() => adminApi.setMember(g.id, add, "member"));
              setAdd("");
            }}
          >
            Hinzufügen
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---- Kinder ----

function Children() {
  const children = useQuery({ queryKey: ["admin", "children"], queryFn: adminApi.children });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });
  const { run, error } = useAdminAction();
  const [adding, setAdding] = useState<Record<string, string>>({});
  if (!children.data) return <Spinner />;
  return (
    <Section title={`Kinderprofile (${children.data.length})`} error={error}>
      {children.data.length === 0 && <p className="text-sm text-stone-500">Keine Kinderprofile.</p>}
      <ul className="space-y-2">
        {children.data.map((k) => (
          <Card key={k.id} className="p-4!">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {k.displayName} {k.guardians.length === 0 && <Badge tone="amber">ohne Verwalter</Badge>}
                </p>
                <p className="text-xs text-stone-500">
                  {k.wishCount} Wünsche · Gruppen: {k.groups.map((g) => g.name).join(", ") || "keine"}
                  {k.pendingHandoverEmail && ` · Übergabe an ${k.pendingHandoverEmail} offen`}
                </p>
              </div>
              <Button
                variant="ghost"
                className={`${small} text-brand-700!`}
                onClick={() => run(() => adminApi.deleteChild(k.id), `Kinderprofil „${k.displayName}“ mit Wunschliste löschen?`)}
              >
                Löschen
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-stone-500">Verwalter:</span>
              {k.guardians.map((g) => (
                <span key={g.userId} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5">
                  {g.name}
                  <button aria-label={`${g.name} entfernen`} className="text-stone-400 hover:text-brand-700" onClick={() => run(() => adminApi.removeGuardian(k.id, g.userId))}>
                    <Icon name="close" />
                  </button>
                </span>
              ))}
              <select
                value={adding[k.id] ?? ""}
                onChange={(e) => {
                  const userId = e.target.value;
                  setAdding({ ...adding, [k.id]: "" });
                  if (userId) void run(() => adminApi.addGuardian(k.id, userId));
                }}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm"
              >
                <option value="">+ Verwalter …</option>
                {(users.data ?? [])
                  .filter((u) => !k.guardians.some((g) => g.userId === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

// ---- Events ----

function Events() {
  const events = useQuery({ queryKey: ["admin", "events"], queryFn: adminApi.events });
  const { run, error } = useAdminAction();
  if (!events.data) return <Spinner />;
  return (
    <Section title={`Events (${events.data.length})`} error={error}>
      <ul className="space-y-2">
        {events.data.map((e) => (
          <Card key={e.id} className="flex flex-wrap items-center gap-2 p-4!">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                <Icon name={e.type === "secret_santa" ? "secretSanta" : "gift"} className="mr-1.5 text-brand-700" />{e.name}{" "}
                {e.type === "secret_santa" && <Badge tone={e.status === "draft" ? "amber" : "green"}>{e.status === "draft" ? "nicht ausgelost" : "ausgelost"}</Badge>}
              </p>
              <p className="text-xs text-stone-500">
                {e.groupName} · {e.date ? fmt(e.date) : "ohne Datum"} · {e.participantCount} Teilnehmende · von {e.createdByName ?? "?"}
              </p>
            </div>
            <Button variant="ghost" className={`${small} text-brand-700!`} onClick={() => run(() => adminApi.deleteEvent(e.id), `Event „${e.name}“ löschen?`)}>
              Löschen
            </Button>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

// ---- Einladungen & Teilen-Links ----

function Links() {
  const invites = useQuery({ queryKey: ["admin", "invites"], queryFn: adminApi.invites });
  const shares = useQuery({ queryKey: ["admin", "shares"], queryFn: adminApi.shares });
  const { run, error } = useAdminAction();
  return (
    <div className="space-y-8">
      <Section title={`Aktive Einladungen (${invites.data?.length ?? 0})`} error={error}>
        <ul className="space-y-2">
          {invites.data?.map((i) => (
            <Card key={i.id} className="flex flex-wrap items-center gap-2 p-3!">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {i.groupName}: {i.email ? <><Icon name="mail" className="mr-1" />{i.email}</> : <><Icon name="link" className="mr-1" />Link</>}
                </p>
                <p className="text-xs text-stone-500">
                  von {i.createdByName} · gültig bis {fmt(i.expiresAt)} · {i.useCount}× verwendet{i.maxUses !== null && ` von ${i.maxUses}`}
                </p>
              </div>
              <Button variant="ghost" className={`${small} text-brand-700!`} onClick={() => run(() => adminApi.revokeInvite(i.id))}>
                Zurückziehen
              </Button>
            </Card>
          ))}
        </ul>
      </Section>
      <Section title={`Aktive Teilen-Links (${shares.data?.length ?? 0})`}>
        <ul className="space-y-2">
          {shares.data?.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center gap-2 p-3!">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  Liste von {s.profileName}: „{s.label}“
                </p>
                <p className="text-xs text-stone-500">
                  erstellt {fmt(s.createdAt)} · {s.expiresAt ? `gültig bis ${fmt(s.expiresAt)}` : "unbegrenzt"}
                </p>
              </div>
              <Button variant="ghost" className={`${small} text-brand-700!`} onClick={() => run(() => adminApi.revokeShare(s.id))}>
                Zurückziehen
              </Button>
            </Card>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Countdown bis zur automatischen Abmeldung. Jeder Klick und jede Tastatureingabe setzt ihn zurück
 * und meldet die Aktivität (gedrosselt) an den Server, damit auch die Sitzung dort verlängert wird.
 * Rechnet mit Zeitstempeln statt Intervallen, damit er auch nach Standby oder Hintergrund-Tabs stimmt.
 */
function IdleTimer({ onTimeout }: { onTimeout: () => void }) {
  const [deadline, setDeadline] = useState(() => Date.now() + IDLE_MS);
  const [now, setNow] = useState(() => Date.now());
  const lastPing = useRef(Date.now());
  const fired = useRef(false);

  useEffect(() => {
    const activity = () => {
      if (fired.current) return;
      setDeadline(Date.now() + IDLE_MS);
      if (Date.now() - lastPing.current >= PING_EVERY_MS) {
        lastPing.current = Date.now();
        adminApi.me().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      clearInterval(tick);
    };
  }, []);

  const remaining = Math.max(0, deadline - now);
  useEffect(() => {
    if (remaining === 0 && !fired.current) {
      fired.current = true;
      onTimeout();
    }
  }, [remaining, onTimeout]);

  const total = Math.ceil(remaining / 1000);
  const label = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  const warn = total <= 60;
  return (
    <span
      role="timer"
      title="Automatische Abmeldung nach 10 Minuten ohne Aktivität. Jeder Klick setzt den Timer zurück."
      aria-label={`Automatische Abmeldung in ${label} Minuten`}
      className={`rounded-lg px-2 py-1 text-sm tabular-nums ${warn ? "bg-brand-700 font-semibold text-white" : "text-stone-300"}`}
    >
      <Icon name="timer" className="mr-1" />{label}
    </span>
  );
}
