"use client";

import { useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";
import { sizeFeet, type VehicleType } from "@/lib/vehicles";

const NUM: { key: keyof VehicleType; label: string }[] = [
  { key: "max_kg", label: "Max load (kg)" },
  { key: "length_cm", label: "Length (cm)" },
  { key: "width_cm", label: "Width (cm)" },
  { key: "height_cm", label: "Height (cm)" },
  { key: "base_fare", label: "Base fare (₹)" },
  { key: "included_km", label: "Km in base fare" },
  { key: "per_km", label: "Per km after (₹)" },
  { key: "min_fare", label: "Minimum fare (₹)" },
];

// Vehicle types customers can book: names, load and cargo size, and each type's fare. Bike fares come from the Settings tab.
export default function VehiclesTab() {
  const [rows, setRows] = useState<VehicleType[] | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase().from("vehicle_types").select("*").order("sort_order").then(({ data }) => setRows((data as VehicleType[]) ?? []));
  }, []);

  if (!rows) return <p className="text-stone-500">Loading…</p>;

  const edit = (code: string, patch: Partial<VehicleType>) => setRows(rows.map((r) => (r.code === code ? { ...r, ...patch } : r)));

  async function save(r: VehicleType) {
    const { code, ...rest } = r;
    const { error } = await supabase().from("vehicle_types").update(rest).eq("code", code);
    setMsg({ ...msg, [code]: error ? errorText(error) : "Saved" });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">Sizes and fares here are starting points. Check them against your costs. Bike fares are set in the Settings tab.</p>
      {rows.map((r) => (
        <div key={r.code} className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <input className="input max-w-xs font-semibold" value={r.name} onChange={(e) => edit(r.code, { name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={r.active} onChange={(e) => edit(r.code, { active: e.target.checked })} /> Bookable
            </label>
          </div>
          <input className="input" placeholder="What it suits" value={r.description} onChange={(e) => edit(r.code, { description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NUM.map((f) => (
              <label key={f.key} className="label">
                {f.label}
                <input
                  className="input"
                  type="number"
                  min={0}
                  disabled={r.code === "bike" && ["base_fare", "included_km", "per_km", "min_fare"].includes(f.key)}
                  value={r[f.key] as number}
                  onChange={(e) => edit(r.code, { [f.key]: Number(e.target.value) } as Partial<VehicleType>)}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary py-1.5" onClick={() => save(r)}>
              Save
            </button>
            <span className="text-xs text-stone-500">Shown to customers as {sizeFeet(r)}</span>
            {msg[r.code] && <span className="text-sm">{msg[r.code]}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
