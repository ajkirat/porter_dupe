"use client";

import { useState } from "react";
import Map from "@/components/Map";
import StatusBadge from "@/components/StatusBadge";
import { navigationUrl, type LatLng } from "@/lib/geo";
import { errorText, supabase } from "@/lib/supabase";
import type { Job } from "@/lib/types";
import JobCard from "./JobCard";

// The job the driver is doing right now: navigate, call, and confirm each leg with an OTP.
export default function ActiveJob({ job, me, onChange }: { job: Job; me: LatLng | null; onChange: () => void }) {
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const atPickupLeg = job.status === "accepted";
  const target = atPickupLeg ? { lat: job.pickup_lat, lng: job.pickup_lng } : { lat: job.drop_lat, lng: job.drop_lng };
  const contact = atPickupLeg
    ? { name: job.pickup_contact_name, phone: job.pickup_contact_phone }
    : { name: job.receiver_name, phone: job.receiver_phone };

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().rpc(atPickupLeg ? "mark_picked_up" : "mark_delivered", { p_job: job.id, p_otp: otp });
    setBusy(false);
    if (error) return setError(errorText(error));
    setOtp("");
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Current job</h2>
        <StatusBadge status={job.status} />
      </div>
      <Map
        markers={[
          { pos: target, label: atPickupLeg ? "Pickup" : "Drop", kind: atPickupLeg ? "pickup" : "drop" },
          ...(me ? [{ pos: me, label: "You", kind: "driver" as const }] : []),
        ]}
        className="h-56"
      />
      <JobCard job={job}>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <a className="btn btn-primary" href={navigationUrl(target)} target="_blank" rel="noreferrer">
            Navigate to {atPickupLeg ? "pickup" : "drop"}
          </a>
          {contact.phone ? (
            <a className="btn" href={`tel:${contact.phone}`}>
              Call {contact.name || (atPickupLeg ? "sender" : "receiver")}
            </a>
          ) : (
            <span className="btn opacity-50">No contact number</span>
          )}
        </div>
      </JobCard>
      <form onSubmit={confirm} className="card space-y-3">
        <label className="label">
          {atPickupLeg ? "Pickup OTP from the sender" : "Drop OTP from the receiver"}
          <input
            className="input text-center text-2xl tracking-[0.5em]"
            inputMode="numeric"
            maxLength={4}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary w-full py-3" disabled={busy || otp.length !== 4}>
          {atPickupLeg ? "Confirm pickup" : `Confirm delivery · collect ₹${job.fare_rupees}`}
        </button>
      </form>
    </div>
  );
}
