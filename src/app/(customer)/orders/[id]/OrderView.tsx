"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BackIcon, CheckIcon, PhoneIcon, ShareIcon } from "@/components/icons";
import Map, { type MapMarker } from "@/components/Map";
import Sheet from "@/components/Sheet";
import { formatKm } from "@/lib/fare";
import { errorText, supabase } from "@/lib/supabase";
import type { Driver, Job, JobStatus } from "@/lib/types";

type Secrets = { pickup_otp: string; drop_otp: string };

const HEADLINE: Record<JobStatus, string> = {
  requested: "Finding a driver near you",
  assigned: "Finding a driver near you",
  accepted: "Driver is on the way to pickup",
  picked_up: "Your parcel is on its way",
  delivered: "Delivered",
  cancelled: "Order cancelled",
};

// Four dots: booked, driver found, picked up, delivered.
const PROGRESS: Record<JobStatus, number> = { requested: 1, assigned: 1, accepted: 2, picked_up: 3, delivered: 4, cancelled: 0 };

export default function OrderView() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sheetH, setSheetH] = useState(340);
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

  if (notFound) return <p className="p-6 text-stone-500">Order not found.</p>;
  if (!job) return <p className="p-6 text-stone-500">Loading…</p>;

  const trackingUrl = `${window.location.origin}/track/${job.tracking_token}`;
  const active = job.status === "requested" || job.status === "assigned" || job.status === "accepted" || job.status === "picked_up";
  const markers: MapMarker[] = [
    { pos: { lat: job.pickup_lat, lng: job.pickup_lng }, label: "Pickup", kind: "pickup" },
    { pos: { lat: job.drop_lat, lng: job.drop_lng }, label: "Drop", kind: "drop" },
  ];
  if (driver?.last_lat && driver.last_lng && (job.status === "accepted" || job.status === "picked_up")) {
    markers.push({ pos: { lat: driver.last_lat, lng: driver.last_lng }, label: driver.full_name, kind: "driver" });
  }
  // The OTP the customer needs to read out next.
  const otp = job.status === "picked_up" ? { label: "Drop OTP", hint: "Give this to the receiver. The driver asks for it at delivery.", value: secrets?.drop_otp } : { label: "Pickup OTP", hint: "Tell the driver this when they collect the parcel.", value: secrets?.pickup_otp };

  async function share() {
    const text = `Track my parcel on Pikop: ${trackingUrl}`;
    if (navigator.share) {
      await navigator.share({ title: "Track my parcel", text, url: trackingUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    }
  }

  async function cancel() {
    if (!confirm("Cancel this delivery?")) return;
    const { error } = await supabase().rpc("cancel_job", { p_job: id, p_reason: "cancelled by customer" });
    if (error) setError(errorText(error));
    else load();
  }

  return (
    <div className="absolute inset-0">
      <Map markers={markers} padBottom={sheetH + 24} className="absolute inset-0 h-full" />
      <Link href="/orders" className="absolute left-4 top-4 z-10 rounded-full bg-white p-3 shadow-lg" aria-label="Back to orders">
        <BackIcon className="h-5 w-5" />
      </Link>

      <Sheet onHeight={setSheetH}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{HEADLINE[job.status]}</h1>
            {job.status === "requested" && <p className="mt-0.5 text-sm text-stone-500">This can take a few minutes. We&apos;ll update this screen.</p>}
          </div>
          <p className="text-xl font-bold">₹{job.fare_rupees}</p>
        </div>

        {job.status !== "cancelled" && (
          <div className="mt-3 flex gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= PROGRESS[job.status] ? "bg-brand" : "bg-stone-200"} ${job.status === "requested" && n === 1 ? "animate-pulse" : ""}`} />
            ))}
          </div>
        )}

        {job.status === "delivered" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-green-50 p-4 text-green-800">
            <CheckIcon className="h-8 w-8" />
            <p className="text-sm">
              Delivered. Please pay the driver ₹{job.fare_rupees} by {job.payment_mode === "cash" ? "cash" : "UPI"} if you haven&apos;t already.
            </p>
          </div>
        )}

        {(job.status === "accepted" || job.status === "picked_up") && otp.value && (
          <div className="mt-4 rounded-2xl bg-stone-900 p-4 text-center text-white">
            <p className="text-xs uppercase tracking-wide text-stone-300">{otp.label}</p>
            <p className="my-1 text-4xl font-bold tracking-[0.4em]">{otp.value}</p>
            <p className="text-xs text-stone-300">{otp.hint}</p>
          </div>
        )}

        {driver && active && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-stone-200 p-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-brand">{driver.full_name[0]}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{driver.full_name}</p>
              <p className="text-xs text-stone-500">
                {driver.vehicle_number}
                {driver.upi_id && ` · UPI ${driver.upi_id}`}
              </p>
            </div>
            <a href={`tel:${driver.phone}`} className="rounded-full bg-brand p-3 text-white" aria-label="Call driver">
              <PhoneIcon className="h-5 w-5" />
            </a>
          </div>
        )}

        <div className="mt-4 space-y-1.5 text-sm">
          <p>
            <span className="mr-2 text-green-600">●</span>
            {job.pickup_address}
          </p>
          <p>
            <span className="mr-2 text-red-600">■</span>
            {job.drop_address}
          </p>
          <p className="pt-1 text-xs text-stone-500">
            {formatKm(job.distance_m)} · pay the driver by {job.payment_mode === "cash" ? "cash" : "UPI"} · receiver {job.receiver_name}
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          {active && (
            <button className="btn gap-2" onClick={share}>
              <ShareIcon className="h-5 w-5" />
              {copied ? "Link copied" : "Share tracking link"}
            </button>
          )}
          {(job.status === "requested" || job.status === "assigned" || job.status === "accepted") && (
            <button className="btn btn-danger" onClick={cancel}>
              Cancel delivery
            </button>
          )}
          {(job.status === "delivered" || job.status === "cancelled") && (
            <Link href="/" className="btn btn-primary py-3">
              Send another parcel
            </Link>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Sheet>
    </div>
  );
}
