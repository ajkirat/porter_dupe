"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Map, { type MapMarker } from "@/components/Map";
import { SetupNotice } from "@/components/RequireUser";
import Logo from "@/components/Logo";
import StatusBadge from "@/components/StatusBadge";
import { isConfigured, supabase } from "@/lib/supabase";
import type { JobStatus } from "@/lib/types";

type Tracking = {
  status: JobStatus;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_address: string;
  drop_lat: number;
  drop_lng: number;
  driver_name: string | null;
  vehicle_number: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_seen_at: string | null;
  delivered_at: string | null;
  fare_rupees: number;
  wallet_discount?: number;
  pay_at: "pickup" | "drop";
  payment_mode: "cash" | "upi_to_driver";
};

// Public page for the receiver: no sign-in, just the token from the shared link.
export default function TrackView() {
  const { token } = useParams<{ token: string }>();
  const [t, setT] = useState<Tracking | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!isConfigured()) return;
    const load = () =>
      supabase()
        .rpc("get_tracking", { p_token: token })
        .then(({ data }) => {
          const row = (data as Tracking[] | null)?.[0];
          if (row) setT(row);
          else setMissing(true);
        });
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [token]);

  if (!isConfigured()) return <SetupNotice />;
  if (missing) return <p className="text-center text-stone-500">This tracking link isn&apos;t valid.</p>;
  if (!t) return <p className="text-center text-stone-500">Loading…</p>;

  const markers: MapMarker[] = [
    { pos: { lat: t.pickup_lat, lng: t.pickup_lng }, label: "Pickup", kind: "pickup" },
    { pos: { lat: t.drop_lat, lng: t.drop_lng }, label: "Drop", kind: "drop" },
  ];
  if (t.driver_lat && t.driver_lng) markers.push({ pos: { lat: t.driver_lat, lng: t.driver_lng }, label: "Driver", kind: "driver" });

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Logo className="text-xl text-stone-900" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Parcel tracking</h1>
        <StatusBadge status={t.status} />
      </div>
      <Map markers={markers} className="h-72 rounded-xl" />
      <div className="card space-y-2 text-sm">
        <p>
          <span className="text-green-700">●</span> {t.pickup_address}
        </p>
        <p>
          <span className="text-red-600">●</span> {t.drop_address}
        </p>
        {t.driver_name && (
          <p className="text-stone-600">
            Driver: {t.driver_name} · {t.vehicle_number}
          </p>
        )}
        {t.pay_at === "drop" && t.status !== "delivered" && t.status !== "cancelled" && (
          <p className="rounded-lg bg-orange-50 p-3 font-medium text-orange-900">
            Please keep ₹{t.fare_rupees - (t.wallet_discount ?? 0)} ready for the driver ({t.payment_mode === "cash" ? "cash" : "UPI"}) when the parcel arrives.
          </p>
        )}
        {t.driver_seen_at && (
          <p className="text-xs text-stone-500">Location updated {new Date(t.driver_seen_at).toLocaleTimeString("en-IN")}</p>
        )}
        {t.delivered_at && <p className="text-stone-600">Delivered at {new Date(t.delivered_at).toLocaleString("en-IN")}</p>}
      </div>
    </div>
  );
}
