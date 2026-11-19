import type React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPrice, type OwnWishDto, type WishInput } from "@wunschliste/shared";
import { wishesApi } from "../lib/api.ts";
import { Dialog } from "./Dialog.tsx";
import { LinkChips } from "./LinkChips.tsx";
import { Alert, Badge, Button, Card, Spinner } from "./ui.tsx";
import { WishEditor } from "./WishEditor.tsx";

/**
 * Verwaltung einer Wunschliste (eigene oder später die eines Kindes).
 * Zeigt bewusst keinerlei Reservierungsstatus an.
 */
export function WishlistManager({ profileId, ownerName }: { profileId: string; ownerName?: string }) {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<OwnWishDto | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const active = useQuery({ queryKey: ["wishes", profileId, "active"], queryFn: () => wishesApi.list(profileId, "active") });
  const archived = useQuery({ queryKey: ["wishes", profileId, "archived"], queryFn: () => wishesApi.list(profileId, "archived") });
  const groups = useQuery({ queryKey: ["profile-groups", profileId], queryFn: () => wishesApi.groups(profileId) });
  const groupName = (id: string) => groups.data?.find((g) => g.id === id)?.name ?? "?";

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["wishes", profileId] });
  const onError = (e: Error) => setError(e.message);

  const save = useMutation({
    mutationFn: (input: WishInput) =>
      editing === "new" || !editing ? wishesApi.create(profileId, input) : wishesApi.update(editing.id, input),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
    },
    onError,
  });
  const archive = useMutation({ mutationFn: wishesApi.archive, onSuccess: invalidate, onError });
  const restore = useMutation({ mutationFn: wishesApi.restore, onSuccess: invalidate, onError });
  const remove = useMutation({ mutationFn: wishesApi.remove, onSuccess: invalidate, onError });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => wishesApi.reorder(profileId, ids),
    onMutate: (ids) => {
      // sofort umsortieren, nicht auf den Server warten
      queryClient.setQueryData<OwnWishDto[]>(["wishes", profileId, "active"], (old) =>
        old ? ids.map((id) => old.find((w) => w.id === id)!).filter(Boolean) : old,
      );
    },
    onSettled: invalidate,
    onError,
  });

  function move(index: number, delta: number) {
    const ids = active.data!.map((w) => w.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  }

  const wishes = tab === "active" ? active : archived;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{ownerName ? `Wunschliste von ${ownerName}` : "Meine Wunschliste"}</h1>
        <Button onClick={() => setEditing("new")}>+ Wunsch hinzufügen</Button>
      </div>

      <div className="flex gap-1 border-b border-stone-200 text-sm">
        {(
          [
            ["active", `Wünsche${active.data ? ` (${active.data.length})` : ""}`],
            ["archived", `Archiv${archived.data?.length ? ` (${archived.data.length})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${tab === key ? "border-brand-700 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}

      {wishes.isPending ? (
        <Spinner />
      ) : wishes.data?.length === 0 ? (
        <Card className="text-center">
          {tab === "active" ? (
            <>
              <p className="text-4xl">🎁</p>
              <h2 className="mt-2 font-semibold">Noch keine Wünsche</h2>
              <p className="mt-1 text-sm text-stone-600">Füge deinen ersten Wunsch hinzu, gerne mit Link zum Artikel.</p>
            </>
          ) : (
            <p className="text-sm text-stone-600">
              Das Archiv ist leer. Erfüllte Wünsche kannst du hierher verschieben, z. B. nach Weihnachten.
            </p>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {wishes.data?.map((w, i) => (
            <li key={w.id}>
              <Card className="p-4! sm:p-5!">
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-semibold break-words">{w.title}</h3>
                      {w.priceCents !== null && <span className="text-sm text-stone-600">ca. {formatPrice(w.priceCents)}</span>}
                    </div>
                    {w.description && <p className="mt-1 text-sm whitespace-pre-line text-stone-600">{w.description}</p>}
                    <LinkChips links={w.links} />
                    {!w.visibleInAllGroups && (
                      <div className="mt-2">
                        <Badge tone="amber">
                          {w.groupIds.length === 0 ? "🔒 Nur für dich sichtbar" : `👁 Nur: ${w.groupIds.map(groupName).join(", ")}`}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {tab === "active" && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <IconButton label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </IconButton>
                      <IconButton label="Nach unten" disabled={i === wishes.data!.length - 1} onClick={() => move(i, 1)}>
                        ↓
                      </IconButton>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1 border-t border-stone-100 pt-3">
                  {tab === "active" ? (
                    <>
                      <SmallButton onClick={() => setEditing(w)}>✏️ Bearbeiten</SmallButton>
                      <SmallButton onClick={() => archive.mutate(w.id)}>📦 Archivieren</SmallButton>
                    </>
                  ) : (
                    <SmallButton onClick={() => restore.mutate(w.id)}>↩️ Wiederherstellen</SmallButton>
                  )}
                  <SmallButton danger onClick={() => confirm(`„${w.title}“ endgültig löschen?`) && remove.mutate(w.id)}>
                    🗑 Löschen
                  </SmallButton>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Neuer Wunsch" : "Wunsch bearbeiten"}>
        {editing !== null && (
          <WishEditor
            key={editing === "new" ? "new" : editing.id}
            profileId={profileId}
            initial={editing === "new" ? undefined : editing}
            busy={save.isPending}
            onSubmit={(input) => save.mutate(input)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function SmallButton({ danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-stone-100 ${danger ? "text-brand-700" : "text-stone-600"}`}
      {...props}
    />
  );
}

function IconButton({ label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="h-8 w-8 rounded-lg text-stone-500 hover:bg-stone-100 disabled:opacity-25 disabled:hover:bg-transparent"
      {...props}
    />
  );
}
