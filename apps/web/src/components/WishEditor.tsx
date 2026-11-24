import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatPrice, imageUrl, MAX_IMAGES_PER_WISH, parsePriceToCents, wishInputSchema, type OwnWishDto, type WishInput } from "@wunschliste/shared";
import { imageFilesFrom } from "../lib/images.ts";
import { wishesApi } from "../lib/api.ts";
import { Alert, Button, Field, TextArea } from "./ui.tsx";
import { Icon } from "./Icon.tsx";

interface Props {
  profileId: string;
  initial?: OwnWishDto;
  busy?: boolean;
  /** Fortschrittsanzeige beim Hochladen */
  busyText?: string | null;
  onSubmit: (input: WishInput, images: ImageChanges) => void;
  onCancel: () => void;
}

export interface ImageChanges {
  newFiles: File[];
  removedImageIds: string[];
}

interface LinkRow {
  key: number;
  url: string;
  label: string;
}

let nextKey = 1;

export function WishEditor({ profileId, initial, busy, busyText, onSubmit, onCancel }: Props) {
  const groups = useQuery({ queryKey: ["profile-groups", profileId], queryFn: () => wishesApi.groups(profileId) });
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial?.priceCents != null ? formatPrice(initial.priceCents).replace(/\s?€/, "") : "");
  const [links, setLinks] = useState<LinkRow[]>(
    initial?.links.length
      ? initial.links.map((l) => ({ key: nextKey++, url: l.url, label: l.label ?? "" }))
      : [{ key: nextKey++, url: "", label: "" }],
  );
  const [allGroups, setAllGroups] = useState(initial?.visibleInAllGroups ?? true);
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const existingImages = (initial?.images ?? []).filter((i) => !removedImageIds.includes(i.id));
  const imageCount = existingImages.length + newFiles.length;
  const previews = useMemo(() => newFiles.map((f) => URL.createObjectURL(f)), [newFiles]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const free = MAX_IMAGES_PER_WISH - imageCount;
    if (images.length > free) setError(`Maximal ${MAX_IMAGES_PER_WISH} Bilder pro Wunsch`);
    setNewFiles((fs) => [...fs, ...images.slice(0, Math.max(0, free))]);
  }

  function onPaste(e: ClipboardEvent) {
    const files = imageFilesFrom(e.clipboardData);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(imageFilesFrom(e.dataTransfer));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const priceCents = parsePriceToCents(price);
    if (priceCents === undefined) return setError("Bitte gib den Preis als Zahl an, z. B. 29,99");
    const parsed = wishInputSchema.safeParse({
      title,
      description,
      priceCents,
      links: links.filter((l) => l.url.trim()).map((l) => ({ url: l.url, label: l.label })),
      visibleInAllGroups: allGroups,
      groupIds: allGroups ? [] : groupIds,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    onSubmit(parsed.data, { newFiles, removedImageIds });
  }

  const updateLink = (key: number, patch: Partial<LinkRow>) =>
    setLinks((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form
      onSubmit={submit}
      onPaste={onPaste}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`space-y-4 ${dragging ? "rounded-xl ring-2 ring-brand-500 ring-offset-4" : ""}`}
      noValidate
    >
      {error && <Alert>{error}</Alert>}
      <Field label="Was wünschst du dir?" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Kopfhörer" autoFocus />
      <TextArea
        label="Beschreibung (optional)"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Größe, Farbe, Modell …"
      />
      <Field label="Ungefährer Preis in € (optional)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="z. B. 29,99" />

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-stone-700">Bilder oder Screenshots (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {existingImages.map((img) => (
            <ImageTile key={img.id} src={imageUrl(img.id, "thumb")} onRemove={() => setRemovedImageIds((ids) => [...ids, img.id])} />
          ))}
          {previews.map((src, i) => (
            <ImageTile key={src} src={src} onRemove={() => setNewFiles((fs) => fs.filter((_, j) => j !== i))} />
          ))}
          {imageCount < MAX_IMAGES_PER_WISH && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-xs text-stone-500 hover:border-brand-500 hover:text-brand-700"
            >
              <Icon name="camera" className="text-xl" />
              Hinzufügen
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <p className="mt-1.5 hidden text-xs text-stone-500 sm:block">Tipp: Screenshot mit Strg+V einfügen oder Bilder hierher ziehen.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-stone-700">Links (optional)</legend>
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.key} className="flex gap-2">
              <input
                type="url"
                inputMode="url"
                value={l.url}
                onChange={(e) => updateLink(l.key, { url: e.target.value })}
                placeholder="https://…"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                aria-label="Link entfernen"
                onClick={() => setLinks((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [{ key: nextKey++, url: "", label: "" }]))}
                className="rounded-lg px-3 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
        {links.length < 10 && (
          <button
            type="button"
            onClick={() => setLinks((ls) => [...ls, { key: nextKey++, url: "", label: "" }])}
            className="mt-2 text-sm font-medium text-brand-700 hover:underline"
          >
            + weiteren Link
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-stone-700">Wer sieht diesen Wunsch?</legend>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={allGroups} onChange={() => setAllGroups(true)} className="accent-brand-700" />
            Alle meine Gruppen
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!allGroups} onChange={() => setAllGroups(false)} className="accent-brand-700" />
            Nur bestimmte Gruppen
          </label>
          {!allGroups && (
            <div className="ml-6 space-y-1.5 rounded-lg bg-stone-50 p-3">
              {groups.data?.length === 0 && <p className="text-stone-500">Du bist noch in keiner Gruppe.</p>}
              {groups.data?.map((g) => (
                <label key={g.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-brand-700"
                    checked={groupIds.includes(g.id)}
                    onChange={(e) => setGroupIds((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((id) => id !== g.id)))}
                  />
                  {g.name}
                </label>
              ))}
              {groupIds.length === 0 && groups.data && groups.data.length > 0 && (
                <p className="text-amber-700">Keine Gruppe gewählt: Der Wunsch ist dann nur für dich sichtbar.</p>
              )}
            </div>
          )}
        </div>
      </fieldset>

      {busyText && <p className="text-sm text-stone-500">{busyText}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={busy}>
          {initial ? "Speichern" : "Wunsch hinzufügen"}
        </Button>
      </div>
    </form>
  );
}

function ImageTile({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Bild entfernen"
        className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
