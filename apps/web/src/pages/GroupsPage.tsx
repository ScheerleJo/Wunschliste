import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupInputSchema } from "@wunschliste/shared";
import { Alert, Badge, Button, Card, Field, Spinner, TextArea } from "../components/ui.tsx";
import { groupsApi } from "../lib/api.ts";
import { Icon } from "../components/Icon.tsx";

export function GroupsPage() {
  const groups = useQuery({ queryKey: ["groups"], queryFn: groupsApi.list });
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Gruppen</h1>
        {!creating && <Button onClick={() => setCreating(true)}>+ Neue Gruppe</Button>}
      </div>

      {creating && <CreateGroupCard onCancel={() => setCreating(false)} />}

      {groups.isPending ? (
        <Spinner />
      ) : groups.data?.length === 0 && !creating ? (
        <Card className="text-center">
          <p className="text-4xl text-brand-700"><Icon name="groups" /></p>
          <h2 className="mt-2 font-semibold">Noch keine Gruppe</h2>
          <p className="mt-1 text-sm text-stone-600">
            Lege eine Gruppe an, z. B. „Familie Scheerle“, und lade deine Familie ein. Oder lass dir einen Einladungslink schicken.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.data?.map((g) => (
            <li key={g.id}>
              <Link
                to={`/gruppen/${g.id}`}
                className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-brand-500/40 hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{g.name}</h2>
                  {g.myRole === "admin" && <Badge tone="brand">Admin</Badge>}
                </div>
                {g.description && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{g.description}</p>}
                <p className="mt-3 text-sm text-stone-500">
                  {g.memberCount} {g.memberCount === 1 ? "Mitglied" : "Mitglieder"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateGroupCard({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: groupsApi.create,
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      navigate(`/gruppen/${id}`);
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = groupInputSchema.safeParse({ name, description });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    create.mutate(parsed.data);
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="font-semibold">Neue Gruppe</h2>
        {error && <Alert>{error}</Alert>}
        <Field label="Name" placeholder="z. B. Familie Scheerle" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <TextArea label="Beschreibung (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Gruppe anlegen
          </Button>
        </div>
      </form>
    </Card>
  );
}
