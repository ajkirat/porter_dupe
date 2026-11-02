"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { requiredExtraDocs, type Driver, type DriverPass } from "@/lib/types";

type Stuck = { id: string; pickup_address: string; status: string; created_at: string };

// Only things that need someone to act. An empty screen means there is nothing to do.
export default function TodayTab({
  drivers,
  activePass,
  go,
}: {
  drivers: Driver[];
  activePass: Record<string, DriverPass>;
  go: (tab: "Drivers" | "Trips" | "Ledger") => void;
}) {
  const [stuck, setStuck] = useState<Stuck[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    supabase()
      .from("jobs")
      .select("id,pickup_address,status,created_at")
      .in("status", ["requested", "assigned"])
      .lt("created_at", cutoff)
      .order("created_at")
      .then(({ data }) => {
        setStuck((data as Stuck[]) ?? []);
        setLoaded(true);
      });
  }, []);

  const pending = drivers.filter((d) => d.kyc_status === "pending");
  const soon = now + 24 * 3600_000;
  const expiring = drivers.filter((d) => {
    const p = activePass[d.id];
    return d.kyc_status === "approved" && (!p || new Date(p.ends_at).getTime() < soon);
  });

  const missingDocs = (d: Driver) => requiredExtraDocs(d.vehicle_type).filter((x) => !d.kyc_docs[x.key]).map((x) => x.label);
  const items = [
    ...pending.map((d) => ({
      key: `kyc-${d.id}`,
      text: `Review ${d.full_name} (${d.vehicle_type})`,
      sub: missingDocs(d).length ? `Missing: ${missingDocs(d).join(", ")}` : "All documents are in",
      button: "Review",
      tab: "Drivers" as const,
    })),
    ...stuck.map((j) => ({
      key: `job-${j.id}`,
      text: `Trip waiting ${Math.round((now - new Date(j.created_at).getTime()) / 60000)} min: ${j.pickup_address}`,
      sub: j.status === "assigned" ? "Offered to a driver, not accepted" : "No driver has accepted",
      button: "Open trips",
      tab: "Trips" as const,
    })),
    ...expiring.map((d) => ({
      key: `pass-${d.id}`,
      text: `${d.full_name}: ${activePass[d.id] ? "pass ends within a day" : "no active pass"}`,
      sub: d.phone,
      button: "Add pass",
      tab: "Drivers" as const,
    })),
  ];

  return (
    <div className="space-y-3">
      {!loaded && <p className="text-sm text-stone-500">Checking…</p>}
      {loaded && items.length === 0 && <p className="card text-sm">Nothing to do right now. 🎉</p>}
      {items.map((i) => (
        <div key={i.key} className="card flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-medium">{i.text}</p>
            <p className="text-stone-500">{i.sub}</p>
          </div>
          <button className="btn btn-primary shrink-0 py-1.5" onClick={() => go(i.tab)}>
            {i.button}
          </button>
        </div>
      ))}
      <p className="text-xs text-stone-500">Missed support calls are not tracked here yet. Referral credits are applied automatically; see the Ledger tab.</p>
    </div>
  );
}
