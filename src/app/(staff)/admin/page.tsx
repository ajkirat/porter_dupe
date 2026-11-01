"use client";

import { useCallback, useEffect, useState } from "react";
import RequireUser from "@/components/RequireUser";
import { supabase } from "@/lib/supabase";
import type { Driver, DriverPass } from "@/lib/types";
import BulkCreditTab from "./BulkCreditTab";
import DriversTab from "./DriversTab";
import RewardsTab from "./RewardsTab";
import SettingsTab from "./SettingsTab";
import TripsTab from "./TripsTab";

const TABS = ["Trips", "Drivers", "Bulk credit", "Referrals", "Settings"] as const;

function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Trips");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [activePass, setActivePass] = useState<Record<string, DriverPass>>({});

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: ds }, { data: ps }] = await Promise.all([
      sb.from("drivers").select("*").order("created_at", { ascending: false }),
      sb.from("driver_passes").select("*").gt("ends_at", new Date().toISOString()).order("ends_at"),
    ]);
    setDrivers(ds ?? []);
    const now = Date.now();
    // Latest-ending pass that has already started, per driver.
    const map: Record<string, DriverPass> = {};
    for (const p of ps ?? []) if (new Date(p.starts_at).getTime() <= now || map[p.driver_id]) map[p.driver_id] = p;
    setActivePass(map);
  }, []);

  useEffect(() => {
    // Async loader: state is only set after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const eligible = drivers.filter((d) => d.kyc_status === "approved" && activePass[d.id]);
  const pending = drivers.filter((d) => d.kyc_status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-stone-500">
          {eligible.length} drivers with an active pass · {eligible.filter((d) => d.is_online).length} online
        </p>
      </div>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t} className={`btn ${tab === t ? "btn-primary" : ""}`} onClick={() => setTab(t)}>
            {t}
            {t === "Drivers" && pending > 0 && ` (${pending} to review)`}
          </button>
        ))}
      </div>
      {tab === "Trips" && <TripsTab eligible={eligible} />}
      {tab === "Drivers" && <DriversTab drivers={drivers} activePass={activePass} reload={load} />}
      {tab === "Bulk credit" && <BulkCreditTab />}
      {tab === "Referrals" && <RewardsTab />}
      {tab === "Settings" && <SettingsTab />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireUser loginTitle="Admin sign in">
      {({ profile }) =>
        profile?.is_admin ? (
          <Admin />
        ) : (
          <div className="card mx-auto max-w-md text-sm">
            This account isn&apos;t an admin. Set <code>is_admin = true</code> on your row in the <code>profiles</code> table.
          </div>
        )
      }
    </RequireUser>
  );
}
