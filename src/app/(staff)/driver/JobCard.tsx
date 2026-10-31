import { formatKm, formatMinutes } from "@/lib/fare";
import { haversineM, type LatLng } from "@/lib/geo";
import type { Job } from "@/lib/types";

export default function JobCard({ job, from, children }: { job: Job; from?: LatLng | null; children?: React.ReactNode }) {
  const away = from ? haversineM(from, { lat: job.pickup_lat, lng: job.pickup_lng }) : null;
  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold">₹{job.fare_rupees}</span>
        <span className="text-sm text-stone-500">
          {formatKm(job.distance_m)} trip {formatMinutes(job.duration_s) && `· ${formatMinutes(job.duration_s)}`}
          {away !== null && ` · ${formatKm(away)} away`}
        </span>
      </div>
      <p className="text-sm">
        <span className="text-green-700">●</span> {job.pickup_address}
      </p>
      <p className="text-sm">
        <span className="text-red-600">●</span> {job.drop_address}
      </p>
      {job.item_note && <p className="text-xs text-stone-500">Item: {job.item_note}</p>}
      <p className="text-xs text-stone-500">Customer pays you by {job.payment_mode === "cash" ? "cash" : "UPI"}</p>
      {children}
    </div>
  );
}
