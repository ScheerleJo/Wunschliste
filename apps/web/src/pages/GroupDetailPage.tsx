import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APP_NAME, groupInputSchema, type GroupDetailDto, type GroupMemberDto, type InviteDto } from "@wunschliste/shared";
import { Alert, Badge, Button, Card, Field, Spinner, TextArea } from "../components/ui.tsx";
import { ApiError, childrenApi, groupsApi, householdsApi } from "../lib/api.ts";
import { useMe } from "../lib/use-me.ts";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const group = useQuery({ queryKey: ["groups", groupId], queryFn: () => groupsApi.get(groupId), retry: false });

  if (group.isPending) return <Spinner />;
  if (group.isError || !group.data) {
    return (
      <Card>
        <p>Diese Gruppe gibt es nicht oder du bist kein Mitglied.</p>
        <Link to="/gruppen" className="mt-2 inline-block text-sm text-brand-700 hover:underline">
          ← Zu meinen Gruppen
        </Link>
      </Card>
    );
  }

  const g = group.data;
  const isAdmin = g.myRole === "admin";

  return (
    <div className="space-y-4">
      <Link to="/gruppen" className="text-sm text-stone-500 hover:underline">
        ← Gruppen
      </Link>
      <GroupHeader group={g} />
      <MembersCard group={g} />
      <AddChildCard group={g} />
      <HouseholdsCard group={g} />
      <Link to={`/events?neu&gruppe=${g.id}`} className="block">
        <div className="rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-600 hover:border-brand-500 hover:text-brand-700">
          🎅 Wichteln oder Fest für diese Gruppe planen →
        </div>
      </Link>
      {isAdmin && <InvitesCard groupId={g.id} />}
      <DangerZone group={g} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function useInvalidateGroup(groupId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["groups", groupId] }),
      queryClient.invalidateQueries({ queryKey: ["groups"], exact: true }),
    ]);
}

function GroupHeader({ group }: { group: GroupDetailDto }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateGroup(group.id);
  const save = useMutation({
    mutationFn: (input: { name: string; description?: string | null }) => groupsApi.update(group.id, input),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = groupInputSchema.safeParse({ name, description });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    save.mutate(parsed.data);
  }

  if (editing) {
    return (
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextArea label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Speichern
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        {group.description && <p className="mt-1 text-stone-600">{group.description}</p>}
      </div>
      {group.myRole === "admin" && (
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Bearbeiten
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MembersCard({ group }: { group: GroupDetailDto }) {
  const isAdmin = group.myRole === "admin";
  return (
    <Card className="p-0!">
      <h2 className="border-b border-stone-100 px-5 py-4 font-semibold">
        Mitglieder <span className="font-normal text-stone-500">({group.members.length})</span>
      </h2>
      <ul className="divide-y divide-stone-100">
        {group.members.map((m) => (
          <MemberRow key={m.profileId} groupId={group.id} member={m} canManage={isAdmin && !m.isMe} />
        ))}
      </ul>
    </Card>
  );
}

function MemberRow({ groupId, member, canManage }: { groupId: string; member: GroupMemberDto; canManage: boolean }) {
  const invalidate = useInvalidateGroup(groupId);
  const [error, setError] = useState<string | null>(null);
  const setRole = useMutation({
    mutationFn: (role: "admin" | "member") => groupsApi.setRole(groupId, member.profileId, role),
    onSuccess: invalidate,
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => groupsApi.removeMember(groupId, member.profileId),
    onSuccess: invalidate,
    onError: (e) => setError(e.message),
  });

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700">
          {member.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Link to={member.isMe ? "/liste" : `/liste/${member.profileId}`} className="font-medium hover:text-brand-700 hover:underline">
            {member.displayName}
          </Link>
          {member.isMe && <Badge>Du</Badge>}
          {member.role === "admin" && <Badge tone="brand">Admin</Badge>}
          {member.managed && <Badge tone="amber">Kind</Badge>}
        </div>
        {member.managedByMe && (
          <Link to={`/liste?profil=${member.profileId}`} className="rounded-lg px-2 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100">
            ✏️ Verwalten
          </Link>
        )}
        <Link
          to={member.isMe ? "/liste" : `/liste/${member.profileId}`}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          🎁 {member.isMe ? "Meine Liste" : "Wunschliste"}
        </Link>
        {canManage && (
          <div className="flex gap-1">
            {!member.managed && (
              <Button
                variant="ghost"
                className="px-2! py-1.5! text-xs"
                disabled={setRole.isPending}
                onClick={() => setRole.mutate(member.role === "admin" ? "member" : "admin")}
              >
                {member.role === "admin" ? "Admin entziehen" : "Zum Admin machen"}
              </Button>
            )}
            <Button
              variant="ghost"
              className="px-2! py-1.5! text-xs text-brand-700!"
              disabled={remove.isPending}
              onClick={() => confirm(`${member.displayName} wirklich aus der Gruppe entfernen?`) && remove.mutate()}
            >
              Entfernen
            </Button>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long" });

function InvitesCard({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const invites = useQuery({ queryKey: ["groups", groupId, "invites"], queryFn: () => groupsApi.invites(groupId) });
  const [days, setDays] = useState(14);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mailSent, setMailSent] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["groups", groupId, "invites"] });
  const create = useMutation({
    mutationFn: (withEmail: boolean) =>
      groupsApi.createInvite(groupId, { expiresInDays: days, email: withEmail ? email.trim() : null }),
    onSuccess: async (inv) => {
      setError(null);
      if (inv.email) {
        setMailSent(inv.email);
        setEmail("");
      } else {
        setFresh(inv.id);
      }
      await refresh();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Fehler beim Erstellen"),
  });
  const revoke = useMutation({ mutationFn: (id: string) => groupsApi.revokeInvite(groupId, id), onSuccess: refresh });

  return (
    <Card>
      <h2 className="font-semibold">Leute einladen</h2>
      <p className="mt-1 text-sm text-stone-600">
        Schicke einen Link (z. B. per WhatsApp) oder lade direkt per Mail ein. Wer noch kein Konto hat, kann sich über den Link
        registrieren.
      </p>

      <div className="mt-4 space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">Gültig für</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base"
            >
              <option value={1}>1 Tag</option>
              <option value={7}>7 Tage</option>
              <option value={14}>14 Tage</option>
              <option value={30}>30 Tage</option>
            </select>
          </label>
          <Button onClick={() => create.mutate(false)} disabled={create.isPending}>
            🔗 Einladungslink erstellen
          </Button>
        </div>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMailSent(null);
            create.mutate(true);
          }}
        >
          <div className="min-w-56 flex-1">
            <Field label="Oder per Mail einladen" type="email" placeholder="oma@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={!email.trim() || create.isPending}>
            ✉️ Einladen
          </Button>
        </form>
        {mailSent && <Alert kind="success">Einladung an {mailSent} verschickt.</Alert>}
      </div>

      {invites.data && invites.data.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-stone-700">Aktive Einladungen</h3>
          <ul className="space-y-2">
            {invites.data.map((inv) => (
              <InviteRow key={inv.id} invite={inv} highlight={inv.id === fresh} onRevoke={() => revoke.mutate(inv.id)} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function InviteRow({ invite, highlight, onRevoke }: { invite: InviteDto; highlight: boolean; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    await navigator.clipboard.writeText(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <li className={`rounded-lg border p-3 text-sm ${highlight ? "border-emerald-300 bg-emerald-50" : "border-stone-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{invite.email ? `✉️ ${invite.email}` : "🔗 Einladungslink"}</span>
        {!invite.email && (
          <>
            <Button variant="secondary" className="px-2.5! py-1.5! text-xs" onClick={copy}>
              {copied ? "Kopiert ✓" : "Kopieren"}
            </Button>
            {canShare && (
              <Button
                variant="secondary"
                className="px-2.5! py-1.5! text-xs"
                onClick={() => navigator.share({ title: `Einladung zu ${APP_NAME}`, url: invite.url }).catch(() => {})}
              >
                Teilen
              </Button>
            )}
          </>
        )}
        <Button variant="ghost" className="px-2.5! py-1.5! text-xs text-brand-700!" onClick={() => confirm("Einladung zurückziehen?") && onRevoke()}>
          Zurückziehen
        </Button>
      </div>
      {!invite.email && <code className="mt-2 block truncate text-xs text-stone-500">{invite.url}</code>}
      <p className="mt-1 text-xs text-stone-500">
        gültig bis {formatDate(invite.expiresAt)} · {invite.useCount}× verwendet
        {invite.maxUses !== null && ` von ${invite.maxUses}`} · erstellt von {invite.createdByName}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------

function DangerZone({ group }: { group: GroupDetailDto }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const me = group.members.find((m) => m.isMe);
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
    navigate("/gruppen", { replace: true });
  };
  const leave = useMutation({
    mutationFn: () => groupsApi.removeMember(group.id, me!.profileId),
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({ mutationFn: () => groupsApi.remove(group.id), onSuccess: done, onError: (e) => setError(e.message) });

  return (
    <div className="space-y-2 pt-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => confirm(`Gruppe „${group.name}“ wirklich verlassen?`) && leave.mutate()}
          disabled={leave.isPending}
        >
          Gruppe verlassen
        </Button>
        {group.myRole === "admin" && (
          <Button
            variant="ghost"
            className="text-brand-700!"
            onClick={() =>
              confirm(`Gruppe „${group.name}“ für alle löschen? Die Wunschlisten der Mitglieder bleiben erhalten.`) && remove.mutate()
            }
            disabled={remove.isPending}
          >
            Gruppe löschen
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Eigene Kinderprofile, die noch nicht in der Gruppe sind, mit einem Klick aufnehmen */
function AddChildCard({ group }: { group: GroupDetailDto }) {
  const { data: me } = useMe();
  const invalidate = useInvalidateGroup(group.id);
  const add = useMutation({ mutationFn: (profileId: string) => childrenApi.addGroup(profileId, group.id), onSuccess: invalidate });
  const missing = (me?.managedProfiles ?? []).filter((p) => !group.members.some((m) => m.profileId === p.id));
  if (missing.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm">
      <span className="text-stone-600">Deine Kinder aufnehmen:</span>
      {missing.map((p) => (
        <Button key={p.id} variant="secondary" className="px-3! py-1.5! text-xs" disabled={add.isPending} onClick={() => add.mutate(p.id)}>
          + 👶 {p.displayName}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Haushalte: wer zusammengehört, zieht sich beim Wichteln nicht gegenseitig */
function HouseholdsCard({ group }: { group: GroupDetailDto }) {
  const queryClient = useQueryClient();
  const households = useQuery({ queryKey: ["households", group.id], queryFn: () => householdsApi.list(group.id) });
  const [editing, setEditing] = useState<{ id?: string; name: string; ids: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = group.myRole === "admin";
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["households", group.id] });
  const save = useMutation({
    mutationFn: (h: { id?: string; name: string; ids: string[] }) =>
      h.id ? householdsApi.update(h.id, h.name, h.ids) : householdsApi.create(group.id, h.name, h.ids),
    onSuccess: async () => {
      setEditing(null);
      setError(null);
      await refresh();
    },
    onError: (e) => setError(e.message),
  });
  const remove = useMutation({ mutationFn: householdsApi.remove, onSuccess: refresh });

  if (!isAdmin && !households.data?.length) return null;
  const inOther = (profileId: string) => households.data?.some((h) => h.id !== editing?.id && h.members.some((m) => m.profileId === profileId));

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">🏠 Haushalte</h2>
        {isAdmin && !editing && (
          <Button variant="secondary" className="px-3! py-1.5! text-xs" onClick={() => setEditing({ name: "", ids: [] })}>
            + Haushalt
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-600">Wer in einem Haushalt lebt (z. B. Paare), zieht sich beim Wichteln nicht gegenseitig.</p>
      <ul className="mt-3 space-y-2">
        {households.data?.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <span className="font-medium">{h.name}:</span>
            <span className="flex-1 text-stone-600">{h.members.map((m) => m.displayName).join(", ")}</span>
            {isAdmin && (
              <span className="flex gap-2 text-xs">
                <button className="text-stone-600 hover:underline" onClick={() => setEditing({ id: h.id, name: h.name, ids: h.members.map((m) => m.profileId) })}>
                  Bearbeiten
                </button>
                <button className="text-brand-700 hover:underline" onClick={() => confirm(`Haushalt „${h.name}“ löschen?`) && remove.mutate(h.id)}>
                  Löschen
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <form
          className="mt-3 space-y-3 rounded-lg bg-stone-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(editing);
          }}
        >
          {error && <Alert>{error}</Alert>}
          <Field label="Name" placeholder="z. B. Josia & Anna" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {group.members.map((m) => (
              <label key={m.profileId} className={`flex items-center gap-2 text-sm ${inOther(m.profileId) ? "text-stone-400" : ""}`}>
                <input
                  type="checkbox"
                  className="accent-brand-700"
                  disabled={inOther(m.profileId)}
                  checked={editing.ids.includes(m.profileId)}
                  onChange={(e) =>
                    setEditing({ ...editing, ids: e.target.checked ? [...editing.ids, m.profileId] : editing.ids.filter((id) => id !== m.profileId) })
                  }
                />
                {m.displayName}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={save.isPending || editing.ids.length < 2 || !editing.name.trim()}>
              Speichern
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
