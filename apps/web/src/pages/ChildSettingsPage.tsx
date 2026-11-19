import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Field, Spinner } from "../components/ui.tsx";
import { childrenApi, groupsApi } from "../lib/api.ts";

export function ChildSettingsPage() {
  const { profileId = "" } = useParams();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const child = useQuery({ queryKey: ["child", profileId], queryFn: () => childrenApi.get(profileId), retry: false });
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["child", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["me"] }),
      queryClient.invalidateQueries({ queryKey: ["groups"] }),
      queryClient.invalidateQueries({ queryKey: ["profile-groups", profileId] }),
    ]);
  const onError = (e: Error) => setError(e.message);
  const remove = useMutation({
    mutationFn: () => childrenApi.remove(profileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/", { replace: true });
    },
    onError,
  });

  if (child.isPending) return <Spinner />;
  if (child.isError || !child.data) {
    return (
      <Card>
        <p>Dieses Kinderprofil gibt es nicht (mehr) oder du verwaltest es nicht.</p>
        <Link to="/" className="mt-2 inline-block text-sm text-brand-700 hover:underline">
          ← Zur Wunschliste
        </Link>
      </Card>
    );
  }
  const c = child.data;

  return (
    <div className="space-y-4">
      <Link to={`/?profil=${c.id}`} className="text-sm text-stone-500 hover:underline">
        ← Wunschliste von {c.displayName}
      </Link>
      <h1 className="text-2xl font-semibold">Kinderprofil: {c.displayName}</h1>
      {params.get("neu") && c.groups.length === 0 && (
        <Alert kind="success">
          Profil angelegt! Nimm {c.displayName} jetzt in eine Gruppe auf, damit die Familie die Wunschliste sieht.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}

      <NameCard id={c.id} name={c.displayName} onSaved={refresh} onError={onError} />
      <GroupsCard id={c.id} name={c.displayName} groups={c.groups} onChange={refresh} onError={onError} />
      <GuardiansCard id={c.id} guardians={c.guardians} onChange={refresh} onError={onError} />
      <HandoverCard id={c.id} name={c.displayName} pending={c.pendingHandover} onChange={refresh} onError={onError} />

      <div className="pt-2">
        <Button
          variant="ghost"
          className="text-brand-700!"
          disabled={remove.isPending}
          onClick={() => confirm(`Kinderprofil „${c.displayName}“ mit der ganzen Wunschliste löschen?`) && remove.mutate()}
        >
          Kinderprofil löschen
        </Button>
      </div>
    </div>
  );
}

type CardProps = { id: string; onError: (e: Error) => void };

function NameCard({ id, name, onSaved, onError }: CardProps & { name: string; onSaved: () => void }) {
  const [value, setValue] = useState(name);
  const save = useMutation({ mutationFn: () => childrenApi.rename(id, value.trim()), onSuccess: onSaved, onError });
  return (
    <Card>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) save.mutate();
        }}
      >
        <div className="min-w-48 flex-1">
          <Field label="Name" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" disabled={value.trim() === name || !value.trim()}>
          Speichern
        </Button>
      </form>
    </Card>
  );
}

function GroupsCard({ id, name, groups, onChange, onError }: CardProps & { name: string; groups: { id: string; name: string }[]; onChange: () => void }) {
  const myGroups = useQuery({ queryKey: ["groups"], queryFn: groupsApi.list });
  const [selected, setSelected] = useState("");
  const add = useMutation({ mutationFn: (groupId: string) => childrenApi.addGroup(id, groupId), onSuccess: () => { setSelected(""); return onChange(); }, onError });
  const remove = useMutation({ mutationFn: (groupId: string) => childrenApi.removeGroup(id, groupId), onSuccess: onChange, onError });
  const available = (myGroups.data ?? []).filter((g) => !groups.some((x) => x.id === g.id));

  return (
    <Card>
      <h2 className="font-semibold">Gruppen</h2>
      <p className="mt-1 text-sm text-stone-600">In diesen Gruppen ist die Wunschliste von {name} sichtbar.</p>
      <ul className="mt-3 space-y-2">
        {groups.length === 0 && <li className="text-sm text-stone-500">Noch in keiner Gruppe.</li>}
        {groups.map((g) => (
          <li key={g.id} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <Link to={`/gruppen/${g.id}`} className="font-medium hover:underline">
              {g.name}
            </Link>
            <button
              className="text-xs font-medium text-brand-700 hover:underline"
              onClick={() => confirm(`${name} aus „${g.name}“ entfernen?`) && remove.mutate(g.id)}
            >
              Entfernen
            </button>
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-48 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base"
          >
            <option value="">Gruppe wählen …</option>
            {available.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Button onClick={() => selected && add.mutate(selected)} disabled={!selected || add.isPending}>
            Aufnehmen
          </Button>
        </div>
      )}
    </Card>
  );
}

function GuardiansCard({
  id,
  guardians,
  onChange,
  onError,
}: CardProps & { guardians: { userId: string; name: string; isMe: boolean }[]; onChange: () => void }) {
  const candidates = useQuery({ queryKey: ["child", id, "candidates"], queryFn: () => childrenApi.candidates(id) });
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState("");
  const after = async () => {
    setSelected("");
    await queryClient.invalidateQueries({ queryKey: ["child", id, "candidates"] });
    await onChange();
  };
  const add = useMutation({ mutationFn: (userId: string) => childrenApi.addGuardian(id, userId), onSuccess: after, onError });
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: (userId: string) => childrenApi.removeGuardian(id, userId),
    onSuccess: async (_, userId) => {
      if (guardians.find((g) => g.userId === userId)?.isMe) {
        await onChange();
        navigate("/", { replace: true });
      } else await after();
    },
    onError,
  });

  return (
    <Card>
      <h2 className="font-semibold">Wer verwaltet die Liste?</h2>
      <p className="mt-1 text-sm text-stone-600">Diese Personen können Wünsche anlegen, bearbeiten und sehen, was reserviert ist.</p>
      <ul className="mt-3 space-y-2">
        {guardians.map((g) => (
          <li key={g.userId} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 font-medium">
              {g.name} {g.isMe && <Badge>Du</Badge>}
            </span>
            {guardians.length > 1 && (
              <button
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={() => confirm(g.isMe ? "Willst du die Verwaltung wirklich abgeben?" : `${g.name} als Verwalter entfernen?`) && remove.mutate(g.userId)}
              >
                {g.isMe ? "Abgeben" : "Entfernen"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {candidates.data && candidates.data.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-48 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base"
          >
            <option value="">Person aus deinen Gruppen …</option>
            {candidates.data.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
          <Button onClick={() => selected && add.mutate(selected)} disabled={!selected || add.isPending}>
            Hinzufügen
          </Button>
        </div>
      )}
    </Card>
  );
}

function HandoverCard({
  id,
  name,
  pending,
  onChange,
  onError,
}: CardProps & { name: string; pending: { email: string; expiresAt: string } | null; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const start = useMutation({ mutationFn: () => childrenApi.startHandover(id, email.trim()), onSuccess: () => { setEmail(""); return onChange(); }, onError });
  const cancel = useMutation({ mutationFn: () => childrenApi.cancelHandover(id), onSuccess: onChange, onError });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim() && confirm(`Übergabelink an ${email.trim()} schicken? Sobald ${name} die Liste übernimmt, kannst du sie nicht mehr verwalten.`)) {
      start.mutate();
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">An {name} übergeben</h2>
      <p className="mt-1 text-sm text-stone-600">
        Ist {name} alt genug für ein eigenes Konto? Dann schick einen Übergabelink. Wünsche, Bilder und Gruppen bleiben erhalten. Danach
        verwaltet {name} die Liste selbst und sieht, wie alle Wünschenden, keine Reservierungen.
      </p>
      {pending ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex-1">
            ✉️ Übergabelink an <b>{pending.email}</b> verschickt, gültig bis {new Date(pending.expiresAt).toLocaleDateString("de-DE")}.
          </span>
          <button className="font-medium underline" onClick={() => cancel.mutate()}>
            Zurückziehen
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Field label={`E-Mail-Adresse von ${name}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={!email.trim() || start.isPending}>
            Übergabelink schicken
          </Button>
        </form>
      )}
    </Card>
  );
}
