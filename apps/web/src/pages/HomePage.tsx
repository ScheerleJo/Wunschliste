import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../components/Dialog.tsx";
import { Alert, Button, Field, Spinner } from "../components/ui.tsx";
import { WishlistManager } from "../components/WishlistManager.tsx";
import { childrenApi } from "../lib/api.ts";
import { useMe } from "../lib/use-me.ts";
import { Icon } from "../components/Icon.tsx";

/** Eigene Wunschliste und die der Kinder, die ich verwalte (Umschalter oben) */
export function HomePage() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  if (!me) return <Spinner />;

  const selected = me.managedProfiles.find((p) => p.id === params.get("profil"));
  const tabs = [{ id: null as string | null, label: "Meine Liste" }, ...me.managedProfiles.map((p) => ({ id: p.id, label: p.displayName }))];

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => {
          const active = (selected?.id ?? null) === t.id;
          return (
            <button
              key={t.id ?? "me"}
              onClick={() => setParams(t.id ? { profil: t.id } : {})}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${active ? "bg-brand-700 text-white" : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"}`}
            >
              {t.id ? <><Icon name="child" className="mr-1" />{t.label}</> : t.label}
            </button>
          );
        })}
        <button
          onClick={() => setCreating(true)}
          className="shrink-0 rounded-full border border-dashed border-stone-300 px-3.5 py-1.5 text-sm text-stone-600 hover:border-brand-500 hover:text-brand-700"
        >
          + Kinderprofil
        </button>
      </div>

      {selected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="flex-1">Du verwaltest diese Liste für {selected.displayName}.</span>
            <span className="flex gap-3">
              <Link to={`/liste/${selected.id}`} className="font-medium underline">
                <Icon name="reserve" className="mr-1" />Was ist reserviert?
              </Link>
              <Link to={`/kinder/${selected.id}`} className="font-medium underline">
                <Icon name="settings" className="mr-1" />Einstellungen
              </Link>
            </span>
          </div>
          <WishlistManager key={selected.id} profileId={selected.id} ownerName={selected.displayName} />
        </>
      ) : (
        <WishlistManager key="me" profileId={me.profile.id} />
      )}

      <CreateChildDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateChildDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Bitte gib einen Namen an");
    setBusy(true);
    try {
      const child = await childrenApi.create(name.trim());
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onClose();
      setName("");
      navigate(`/kinder/${child.id}?neu=1`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Kinderprofil anlegen">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-600">
          Für Kinder ohne eigenes Konto: Du pflegst die Wunschliste, bis du sie irgendwann an dein Kind übergibst. Den anderen Elternteil
          kannst du danach als zweiten Verwalter hinzufügen.
        </p>
        {error && <Alert>{error}</Alert>}
        <Field label="Name des Kindes" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy}>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
