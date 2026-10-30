"use client";

import { useEffect, useState } from "react";
import { searchPlaces, type Place } from "@/lib/geo";

// Text search over OpenStreetMap places in Bengaluru. Picking on the map is the fallback.
export default function PlaceInput({
  label,
  value,
  active,
  onFocus,
  onPick,
}: {
  label: string;
  value: Place | null;
  active: boolean;
  onFocus: () => void;
  onPick: (p: Place) => void;
}) {
  const [text, setText] = useState(value?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [typing, setTyping] = useState(false);
  const [shown, setShown] = useState(value);

  // Reset the text when the parent picks a new place (search result or map tap).
  if (value !== shown) {
    setShown(value);
    setText(value?.label ?? "");
  }

  useEffect(() => {
    if (!typing) return;
    // Nominatim asks for at most one request per second, so debounce.
    const t = setTimeout(() => searchPlaces(text).then(setResults).catch(() => setResults([])), 700);
    return () => clearTimeout(t);
  }, [text, typing]);

  return (
    <div className="relative">
      <label className="label">
        {label}
        <input
          className={`input ${active ? "border-brand" : ""}`}
          placeholder="Search a place, or tap the map"
          value={text}
          onFocus={onFocus}
          onChange={(e) => {
            setTyping(true);
            setText(e.target.value);
          }}
        />
      </label>
      {typing && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
                onClick={() => {
                  setTyping(false);
                  setResults([]);
                  onPick(r);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
