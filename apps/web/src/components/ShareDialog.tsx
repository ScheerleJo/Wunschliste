import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ShareLinkDto } from "@wunschliste/shared";
import { sharesApi } from "../lib/api.ts";
import { Dialog } from "./Dialog.tsx";
import { Alert, Button, Field } from "./ui.tsx";

/** Wunschliste per Link mit Gästen ohne Konto teilen (z. B. Patenonkel) */
export function ShareDialog({ profileId, ownerName, open, onClose }: { profileId: string; ownerName?: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const links = useQuery({ queryKey: ["shares", profileId], queryFn: () => sharesApi.list(profileId), enabled: open });
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["shares", profileId] });
  const create = useMutation({
    mutationFn: () => sharesApi.create(profileId, { label: label.trim(), expiresInDays: days }),
    onSuccess: async (l) => {
      setLabel("");
      setError(null);
      setFresh(l.id);
      await refresh();
    },
    onError: (e) => setError(e.message),
  });
  const revoke = useMutation({ mutationFn: sharesApi.revoke, onSuccess: refresh });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return setError("Bitte gib an, für wen der Link ist");
    create.mutate();
  }

  const whose = ownerName ? `die Wunschliste von ${ownerName}` : "deine Wunschliste";

  return (
    <Dialog open={open} onClose={onClose} title="Wunschliste teilen">
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Mit einem Link kann jemand ohne Konto {whose} ansehen und Wünsche reservieren, z. B. Patenonkel oder Freunde.
          Gäste sehen nur Wünsche, die für <b>alle Gruppen</b> sichtbar sind.
        </p>
        <p className="text-sm text-stone-600">
          <b>Ein Link pro Person bzw. Haushalt:</b> Alles, was über einen Link reserviert wird, gehört zu diesem Link. Wer ihn
          öffnet, sieht diese Reservierungen als eigene und kann sie aufheben.
        </p>
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          🤫 Über den Link sieht man, was schon reserviert ist.{" "}
          {ownerName ? "Gib ihn also nicht an das Kind weiter." : "Öffne ihn also besser nicht selbst, wenn du dich überraschen lassen willst."}
        </div>

        <form onSubmit={submit} className="space-y-3" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Für wen ist der Link?" placeholder="z. B. Patenonkel Peter" value={label} onChange={(e) => setLabel(e.target.value)} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Gültig</span>
              <select
                value={days ?? ""}
                onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base"
              >
                <option value="">unbegrenzt</option>
                <option value={30}>30 Tage</option>
                <option value={90}>3 Monate</option>
                <option value={365}>1 Jahr</option>
              </select>
            </label>
            <Button type="submit" disabled={create.isPending}>
              🔗 Link erstellen
            </Button>
          </div>
        </form>

        {links.data && links.data.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-stone-700">Aktive Links</h3>
            <ul className="space-y-2">
              {links.data.map((l) => (
                <ShareRow key={l.id} link={l} highlight={l.id === fresh} onRevoke={() => revoke.mutate(l.id)} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ShareRow({ link, highlight, onRevoke }: { link: ShareLinkDto; highlight: boolean; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  async function copy() {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <li className={`rounded-lg border p-3 text-sm ${highlight ? "border-emerald-300 bg-emerald-50" : "border-stone-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">🔗 {link.label}</span>
        <Button variant="secondary" className="px-2.5! py-1.5! text-xs" onClick={copy}>
          {copied ? "Kopiert ✓" : "Kopieren"}
        </Button>
        {canShare && (
          <Button
            variant="secondary"
            className="px-2.5! py-1.5! text-xs"
            onClick={() => navigator.share({ title: "Meine Wunschliste", url: link.url }).catch(() => {})}
          >
            Teilen
          </Button>
        )}
        <Button
          variant="ghost"
          className="px-2.5! py-1.5! text-xs text-brand-700!"
          onClick={() => confirm(`Link „${link.label}“ zurückziehen? Bestehende Reservierungen bleiben erhalten.`) && onRevoke()}
        >
          Zurückziehen
        </Button>
      </div>
      <code className="mt-2 block truncate text-xs text-stone-500">{link.url}</code>
      <p className="mt-1 text-xs text-stone-500">
        erstellt am {new Date(link.createdAt).toLocaleDateString("de-DE")}
        {link.expiresAt ? ` · gültig bis ${new Date(link.expiresAt).toLocaleDateString("de-DE")}` : " · unbegrenzt gültig"}
      </p>
    </li>
  );
}
