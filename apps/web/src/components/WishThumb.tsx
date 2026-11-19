import { useState } from "react";
import { imageUrl, type WishImageDto } from "@wunschliste/shared";
import { Lightbox } from "./Lightbox.tsx";

/** Vorschaubild auf einer Wunschkarte; Klick öffnet die Großansicht. */
export function WishThumb({ images, title, size = "md" }: { images: WishImageDto[]; title: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const first = images[0];
  if (!first) return null;
  const box = size === "sm" ? "h-14 w-14" : "h-20 w-20 sm:h-24 sm:w-24";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative ${box} shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100`}
        aria-label={`Bild${images.length > 1 ? "er" : ""} von „${title}“ ansehen`}
      >
        <img src={imageUrl(first.id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
        {images.length > 1 && (
          <span className="absolute right-1 bottom-1 rounded-md bg-black/60 px-1.5 text-[11px] font-medium text-white">+{images.length - 1}</span>
        )}
      </button>
      {open && <Lightbox images={images} start={0} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
