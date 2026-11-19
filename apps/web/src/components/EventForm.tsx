import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventInputSchema, formatPrice, parsePriceToCents, type EventDetailDto, type EventInput } from "@wunschliste/shared";
import { groupsApi } from "../lib/api.ts";
import { Alert, Button, Field, TextArea } from "./ui.tsx";

const toInput = (cents: number | null | undefined) => (cents == null ? "" : formatPrice(cents).replace(/\s?€/, ""));

/** Formular für neue bzw. bestehende Events */
export function EventForm({
  initial,
  defaultGroupId,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: EventDetailDto;
  defaultGroupId?: string;
  busy?: boolean;
  onSubmit: (groupId: string, input: EventInput) => void;
  onCancel: () => void;
}) {
  const groups = useQuery({ queryKey: ["groups"], queryFn: groupsApi.list, enabled: !initial });
  const [groupId, setGroupId] = useState(initial?.groupId ?? defaultGroupId ?? "");
  const [type, setType] = useState<EventInput["type"]>(initial?.type ?? "secret_santa");
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [min, setMin] = useState(toInput(initial?.budgetMinCents));
  const [max, setMax] = useState(toInput(initial?.budgetMaxCents));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const locked = initial && initial.status !== "draft";

  function submit(e: FormEvent) {
    e.preventDefault();
    const gid = groupId || groups.data?.[0]?.id;
    if (!gid) return setError("Bitte wähle eine Gruppe");
    const budgetMinCents = parsePriceToCents(min);
    const budgetMaxCents = parsePriceToCents(max);
    if (budgetMinCents === undefined || budgetMaxCents === undefined) return setError("Bitte gib das Budget als Zahl an, z. B. 25");
    const parsed = eventInputSchema.safeParse({ type, name, date: date || null, budgetMinCents, budgetMaxCents, description });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    onSubmit(gid, parsed.data);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      {!initial && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-700">Gruppe</span>
          <select
            value={groupId || groups.data?.[0]?.id || ""}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base"
          >
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset disabled={locked}>
        <legend className="mb-1 text-sm font-medium text-stone-700">Art</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["secret_santa", "🎅 Wichteln", "Jede Person beschenkt eine ausgeloste andere"],
              ["standard", "🎄 Alle beschenken alle", "z. B. Weihnachten oder ein Geburtstag"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${type === value ? "border-brand-600 bg-brand-50" : "border-stone-300"}`}
            >
              <input type="radio" className="mt-0.5 accent-brand-700" checked={type === value} onChange={() => setType(value)} />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="text-stone-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Name" placeholder="z. B. Wichteln Weihnachten 2026" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Datum (optional)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Budget ab € (optional)" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="z. B. 20" />
        <Field label="Budget bis € (optional)" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="z. B. 30" />
      </div>
      <TextArea label="Beschreibung (optional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ort, Uhrzeit, Regeln …" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={busy}>
          {initial ? "Speichern" : "Event anlegen"}
        </Button>
      </div>
    </form>
  );
}
