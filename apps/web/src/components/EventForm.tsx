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
  const [type, setType] = useState<EventInput["type"]>(initial?.type ?? "standard");
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [min, setMin] = useState(toInput(initial?.budgetMinCents));
  const [max, setMax] = useState(toInput(initial?.budgetMaxCents));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const discardsDraw = initial?.type === "secret_santa" && initial.status !== "draft" && type === "standard";

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
      <Field label="Name" placeholder="z. B. Wichteln Weihnachten 2026" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Datum (optional)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Budget ab € (optional)" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="z. B. 20" />
        <Field label="Budget bis € (optional)" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="z. B. 30" />
      </div>
      <TextArea label="Beschreibung (optional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ort, Uhrzeit, Regeln …" />
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-stone-700">Wird gewichtelt?</legend>
        <WichtelChoice value={type} onChange={setType} />
        <p className="mt-1.5 text-xs text-stone-500">
          {type === "secret_santa"
            ? "Jede Person beschenkt eine ausgeloste andere. Die Auslosung startest du danach auf der Event-Seite."
            : "Alle beschenken alle, z. B. an Weihnachten oder zum Geburtstag. Das kannst du später noch ändern."}
        </p>
        {discardsDraw && <p className="mt-1.5 text-sm text-amber-700">⚠️ Die bisherige Auslosung wird dabei verworfen.</p>}
      </fieldset>
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

/** Ja/Nein-Auswahl: wird gewichtelt? (auch auf der Event-Seite verwendet) */
export function WichtelChoice({
  value,
  onChange,
  disabled,
}: {
  value: EventInput["type"];
  onChange: (type: EventInput["type"]) => void;
  disabled?: boolean;
}) {
  const options = [
    ["standard", "🎄 Nein, alle beschenken alle"],
    ["secret_santa", "🎅 Ja, wir wichteln"],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2 py-2 font-medium transition ${value === v ? "bg-white text-brand-700 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
