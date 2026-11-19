import { useEffect, useState } from "react";
import { imageUrl, type WishImageDto } from "@wunschliste/shared";

/** Vollbild-Ansicht der Bilder eines Wunsches */
export function Lightbox({ images, start, title, onClose }: { images: WishImageDto[]; start: number; title: string; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const img = images[index];
  const go = (d: number) => setIndex((i) => (i + d + images.length) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!img) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-label={`Bilder: ${title}`}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="truncate text-sm">
          {title}
          {images.length > 1 && <span className="text-white/60"> · {index + 1}/{images.length}</span>}
        </span>
        <button className="rounded-lg p-2 hover:bg-white/10" aria-label="Schließen" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <img
          src={imageUrl(img.id)}
          alt={title}
          width={img.width}
          height={img.height}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {images.length > 1 && (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
          </>
        )}
      </div>
    </div>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      aria-label={side === "left" ? "Vorheriges Bild" : "Nächstes Bild"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-2" : "right-2"} rounded-full bg-white/15 px-3 py-2 text-2xl text-white hover:bg-white/30`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
