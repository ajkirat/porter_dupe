"use client";

import { useEffect, useState } from "react";
import { computeFare } from "@/lib/fare";
import { errorText, supabase } from "@/lib/supabase";
import type { Settings } from "@/lib/types";

const FIELDS: { key: keyof Settings; label: string }[] = [
  { key: "base_fare", label: "Base fare (₹)" },
  { key: "included_km", label: "Km included in base fare" },
  { key: "per_km", label: "Per km after that (₹)" },
  { key: "min_fare", label: "Minimum fare (₹)" },
  { key: "daily_pass_price", label: "Driver day pass (₹)" },
  { key: "weekly_pass_price", label: "Driver week pass (₹)" },
  { key: "nearby_radius_km", label: "Drivers see open jobs within (km)" },
];

export default function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    supabase().from("settings").select("*").single().then(({ data }) => setS(data));
  }, []);

  if (!s) return <p className="text-stone-500">Loading…</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("settings")
      .update({ ...s, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSaved(error ? errorText(error) : "Saved");
  }

  return (
    <form onSubmit={save} className="card max-w-md space-y-3">
      {FIELDS.map((f) => (
        <label key={f.key} className="label">
          {f.label}
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            value={s[f.key]}
            onChange={(e) => {
              setSaved("");
              setS({ ...s, [f.key]: Number(e.target.value) });
            }}
          />
        </label>
      ))}
      <p className="text-sm text-stone-600">
        Examples: 3 km = ₹{computeFare(3000, s)}, 8 km = ₹{computeFare(8000, s)}, 15 km = ₹{computeFare(15000, s)}
      </p>
      <button className="btn btn-primary w-full">Save</button>
      {saved && <p className="text-sm text-stone-600">{saved}</p>}
    </form>
  );
}
