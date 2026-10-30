"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Map, { type MapMarker } from "@/components/Map";
import RequireUser from "@/components/RequireUser";
import StatusBadge from "@/components/StatusBadge";
import { formatKm } from "@/lib/fare";
import { errorText, supabase } from "@/lib/supabase";
import { ACTIVE_STATUSES, type Driver, type Job } from "@/lib/types";

type Secrets = { pickup_otp: string; drop_otp: string };

function OrderDetail({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: j } = await sb.from("jobs").select("*").eq("id", id).maybeSingle();
    if (!j) return setNotFound(true);
    setJob(j);
    if (j.driver_id && j.status !== "assigned") {
      const { data: d } = await sb.from("drivers").select("*").eq("id", j.driver_id).maybeSingle();
      setDriver(d);
    } else {
      setDriver(null);
    }
  }, [id]);

  useEffect(() => {
    const sb = supabase();
    // Async loader: state is only set after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    sb.from("job_secrets").select("pickup_otp, drop_otp").eq("job_id", id).maybeSingle().then(({ data }) => setSecrets(data));
    // Live status changes, plus a slow poll for the driver's position.
    const channel = sb
      .channel(`job-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 10000);
    return () => {
      sb.removeChannel(channel);
      clearInterval(poll);
    };
  }, [id, load]);

  if (notFound) return <p className="text-stone-500">Order not found.</p>;
  if (!job) return <p className="text-stone-500">Loading…</p>;

  const trackingUrl = `${window.location.origin}/track/${job.tracking_token}`;
  const markers: MapMarker[] = [
    { pos: { lat: job.pickup_lat, lng: job.pickup_lng }, label: "Pickup", kind: "pickup" },
    { pos: { lat: job.drop_lat, lng: job.drop_lng }, label: "Drop", kind: "drop" },
  ];
  if (driver?.last_lat && driver.last_lng && (job.status === "accepted" || job.status === "picked_up")) {
    markers.push({ pos: { lat: driver.last_lat, lng: driver.last_lng }, label: driver.full_name, kind: "driver" });
  }

  async function share() {
    const text = `Track the parcel: ${trackingUrl}`;
    if (navigator.share) {
      await navigator.share({ title: "Parcel tracking", text, url: trackingUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied(true);
    }
  }

  async function cancel() {
    if (!confirm("Cancel this delivery?")) return;
    const { error } = await supabase().rpc("cancel_job", { p_job: id, p_reason: "cancelled by customer" });
    if (error) setError(errorText(error));
    else load();
  }

  const active = ACTIVE_STATUSES.includes(job.status);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_380px]">
      <Map markers={markers} className="h-72 md:h-[520px]" />
      <div className="space-y-4">
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <StatusBadge status={job.status} />
            <span className="text-xl font-bold">₹{job.fare_rupees}</span>
          </div>
          <p className="text-sm">
            <span className="text-green-700">●</span> {job.pickup_address}
          </p>
          <p className="text-sm">
            <span className="text-red-600">●</span> {job.drop_address}
          </p>
          <p className="text-xs text-stone-500">
            {formatKm(job.distance_m)} · pay the driver by {job.payment_mode === "cash" ? "cash" : "UPI"} · receiver{" "}
            {job.receiver_name}
          </p>
        </div>

        {secrets && active && (
          <div className="card grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-xs text-stone-500">Pickup OTP</p>
              <p className="text-2xl font-bold tracking-widest">{secrets.pickup_otp}</p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Drop OTP</p>
              <p className="text-2xl font-bold tracking-widest">{secrets.drop_otp}</p>
            </div>
            <p className="col-span-2 text-xs text-stone-500">
              Give the pickup OTP to the driver when they collect the parcel. Share the drop OTP with the receiver.
            </p>
          </div>
        )}

        {driver && (
          <div className="card space-y-1 text-sm">
            <p className="font-semibold">{driver.full_name}</p>
            <p className="text-stone-600">
              {driver.vehicle_type} · {driver.vehicle_number}
            </p>
            {driver.upi_id && <p className="text-stone-600">UPI: {driver.upi_id}</p>}
            {active && (
              <a href={`tel:${driver.phone}`} className="btn mt-2 w-full">
                Call driver
              </a>
            )}
          </div>
        )}

        {active && (
          <div className="grid gap-2">
            <button className="btn" onClick={share}>
              {copied ? "Tracking link copied" : "Share tracking link"}
            </button>
            {job.status !== "picked_up" && (
              <button className="btn btn-danger" onClick={cancel}>
                Cancel delivery
              </button>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export default function OrderView() {
  const { id } = useParams<{ id: string }>();
  return <RequireUser>{() => <OrderDetail id={id} />}</RequireUser>;
}
