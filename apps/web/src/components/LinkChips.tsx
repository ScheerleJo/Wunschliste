import type { WishLinkDto } from "@wunschliste/shared";
import { linkHost } from "../lib/format.ts";

export function LinkChips({ links }: { links: WishLinkDto[] }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.id}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700 hover:border-brand-500 hover:text-brand-700"
        >
          🔗 <span className="truncate">{l.label || linkHost(l.url)}</span>
        </a>
      ))}
    </div>
  );
}
