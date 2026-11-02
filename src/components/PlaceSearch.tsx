"use client";

import { useT } from "@/i18n";
import { useEffect, useState } from "react";
import { searchPlaces, type Place } from "@/lib/geo";
import { BackIcon, LocateIcon, SearchIcon } from "./icons";

// Full-screen place search, the way ride apps do it: type, or jump to current location or the map.
export default function PlaceSearch({
  title,
  onPick,
  onClose,
  onUseCurrent,
  onChooseOnMap,
}: {
  title: string;
  onPick: (p: Place) => void;
  onClose: () => void;
  onUseCurrent?: () => void;
  onChooseOnMap: () => void;
}) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [found, setFound] = useState<{ q: string; items: Place[] } | null>(null);
  const q = text.trim();

  useEffect(() => {
    if (q.length < 3) return;
    // Nominatim asks for at most one request a second, so wait for a pause in typing.
    const t = setTimeout(() => {
      searchPlaces(q)
        .then((items) => setFound({ q, items }))
        .catch(() => setFound({ q, items: [] }));
    }, 600);
    return () => clearTimeout(t);
  }, [q]);

  const items = found && found.q === q ? found.items : null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-3">
        <button className="rounded-full p-2 hover:bg-stone-100" onClick={onClose} aria-label={t("Back")}>
          <BackIcon />
        </button>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-stone-300 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-orange-200">
          <SearchIcon className="h-5 w-5 text-stone-400" />
          <input
            className="w-full bg-transparent py-3 text-base outline-none"
            placeholder={t("Search area, street or landmark")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {onUseCurrent && (
          <button className="flex w-full items-center gap-3 border-b border-stone-100 py-3.5 text-left" onClick={onUseCurrent}>
            <LocateIcon className="h-5 w-5 text-brand" />
            <span className="font-medium">{t("Use my current location")}</span>
          </button>
        )}
        <button className="flex w-full items-center gap-3 border-b border-stone-100 py-3.5 text-left" onClick={onChooseOnMap}>
          <span className="flex h-5 w-5 items-center justify-center text-brand">◎</span>
          <span className="font-medium">{t("Choose on map")}</span>
        </button>
        {q.length >= 3 && items === null && <p className="py-4 text-sm text-stone-500">{t("Searching…")}</p>}
        {items?.length === 0 && (
          <p className="py-4 text-sm text-stone-500">{t("Nothing found in Bengaluru. Try a nearby landmark, or choose on the map.")}</p>
        )}
        {items?.map((p) => (
          <button
            key={`${p.lat},${p.lng}`}
            className="block w-full border-b border-stone-100 py-3.5 text-left text-sm"
            onClick={() => onPick(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
