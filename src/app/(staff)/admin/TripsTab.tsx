"use client";

import { useCallback, useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { formatKm } from "@/lib/fare";
import { haversineM } from "@/lib/geo";
import { errorText, supabase } from "@/lib/supabase";
import { ACTIVE_STATUSES, type Driver, type Job } from "@/lib/types";

// Trips list with manual dispatch: offer any open job to an eligible driver.
export default function TripsTab({ eligible }: { eligible: Driver[] }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const [drivers, setDrivers] = useState<Record<string, Driver>>({});
  const [otps, setOtps] = useState<Record<string, { pickup_otp: string; drop_otp: string }>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const sb = supabase();
    let q = sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(100);
    if (onlyActive) q = q.in("status", ACTIVE_STATUSES);
    const { data } = await q;
    setJobs(data ?? []);
    const ids = [...new Set((data ?? []).map((j) => j.driver_id).filter(Boolean))];
    if (ids.length) {
      const { data: ds } = await sb.from("drivers").select("*").in("id", ids);
      setDrivers(Object.fromEntries((ds ?? []).map((d) => [d.id, d])));
    }
  }, [onlyActive]);

  useEffect(() => {
    // Async loader: state is only set after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const sb = supabase();
    const channel = sb
      .channel("admin-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => load())
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [load]);

  async function rpc(fn: string, args: Record<string, unknown>) {
    setError("");
    const { error } = await supabase().rpc(fn, args);
    if (error) setError(errorText(error));
    load();
  }

  async function showOtps(jobId: string) {
    const { data } = await supabase().from("job_secrets").select("pickup_otp, drop_otp").eq("job_id", jobId).single();
    if (data) setOtps({ ...otps, [jobId]: data });
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
        Only active trips
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {jobs.length === 0 && <p className="text-sm text-stone-500">No trips.</p>}
      {jobs.map((j) => {
        const driver = j.driver_id ? drivers[j.driver_id] : null;
        // Nearest eligible drivers first, by their last known position.
        const options = eligible
          .map((d) => ({
            d,
            dist: d.last_lat && d.last_lng ? haversineM({ lat: d.last_lat, lng: d.last_lng }, { lat: j.pickup_lat, lng: j.pickup_lng }) : Infinity,
          }))
          .sort((a, b) => a.dist - b.dist);
        return (
          <div key={j.id} className="card space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={j.status} />
                <span className="text-xs text-stone-500">{new Date(j.created_at).toLocaleString("en-IN")}</span>
              </div>
              <span className="font-semibold">
                ₹{j.fare_rupees} · {formatKm(j.distance_m)} · pay {j.pay_at}
              </span>
            </div>
            <p>
              <span className="text-green-700">●</span> {j.pickup_address}
            </p>
            <p>
              <span className="text-red-600">●</span> {j.drop_address} · {j.receiver_name} {j.receiver_phone}
            </p>
            {driver && (
              <p className="text-stone-600">
                Driver: {driver.full_name} · {driver.phone} · {driver.vehicle_number}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {(j.status === "requested" || j.status === "assigned") && (
                <select
                  className="input mt-0 w-auto py-1.5 text-sm"
                  value=""
                  onChange={(e) => e.target.value && rpc("admin_assign_job", { p_job: j.id, p_driver: e.target.value })}
                >
                  <option value="">{eligible.length ? "Offer to driver…" : "No drivers with an active pass"}</option>
                  {options.map(({ d, dist }) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} {d.is_online ? "(online)" : "(offline)"} {Number.isFinite(dist) ? `· ${formatKm(dist)}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {ACTIVE_STATUSES.includes(j.status) && j.status !== "picked_up" && (
                <button className="btn btn-danger py-1.5" onClick={() => confirm("Cancel this trip?") && rpc("cancel_job", { p_job: j.id, p_reason: "cancelled by admin" })}>
                  Cancel
                </button>
              )}
              {ACTIVE_STATUSES.includes(j.status) &&
                (otps[j.id] ? (
                  <span className="text-xs text-stone-600">
                    Pickup OTP {otps[j.id].pickup_otp} · Drop OTP {otps[j.id].drop_otp}
                  </span>
                ) : (
                  <button className="btn py-1.5" onClick={() => showOtps(j.id)}>
                    Show OTPs
                  </button>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
