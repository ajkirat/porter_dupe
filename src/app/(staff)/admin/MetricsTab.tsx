"use client";

import { useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";

type M = {
  jobs_week: number; accepted_fast: number; delivered: number; active_drivers: number;
  customers_week: number; repeat_customers: number; customers_ever: number; paying_drivers: number;
};
type Cancel = { who: string; id: string; name: string; phone: string; cancelled: number; total: number };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// The five weekly numbers from the business plan, plus cancellation counts (tracking only).
export default function MetricsTab() {
  const [m, setM] = useState<M | null>(null);
  const [cancels, setCancels] = useState<Cancel[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const sb = supabase();
    sb.rpc("admin_weekly_metrics").then(({ data, error }) => (error ? setError(errorText(error)) : setM(data as M)));
    sb.rpc("admin_cancel_stats").then(({ data }) => setCancels((data as Cancel[]) ?? []));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!m) return <p className="text-stone-500">Loading…</p>;

  const rows = [
    { label: "Trips accepted in under 5 min", value: `${pct(m.accepted_fast, m.jobs_week)}%`, target: "target 80%", ok: pct(m.accepted_fast, m.jobs_week) >= 80 },
    { label: "Trips per active driver (7 days)", value: m.active_drivers ? (m.delivered / m.active_drivers).toFixed(1) : "0", target: "target 5 or more", ok: m.active_drivers > 0 && m.delivered / m.active_drivers >= 5 },
    { label: "Customers who booked again (all time)", value: `${pct(m.repeat_customers, m.customers_ever)}%`, target: "target 40%", ok: pct(m.repeat_customers, m.customers_ever) >= 40 },
    { label: "Drivers with an active pass now", value: String(m.paying_drivers), target: "compare with your growth curve", ok: true },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="card text-sm">
            <p className="text-stone-600">{r.label}</p>
            <p className={`text-2xl font-semibold ${r.ok ? "text-green-700" : "text-amber-700"}`}>{r.value}</p>
            <p className="text-xs text-stone-500">{r.target}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500">Support: returning missed calls the same day is checked by you; not tracked in the app.</p>
      <div className="card text-sm">
        <p className="mb-2 font-semibold">Cancellations (nothing is blocked)</p>
        {cancels.length === 0 && <p className="text-stone-500">None yet.</p>}
        {cancels.map((c) => (
          <p key={c.who + c.id} className="flex justify-between border-t border-stone-100 py-1">
            <span>{c.name} <span className="text-stone-500">({c.who}) {c.phone}</span></span>
            <span>{c.cancelled} of {c.total}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
