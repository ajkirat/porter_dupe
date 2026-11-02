"use client";

import { useState } from "react";
import { formatKm } from "@/lib/fare";
import type { Job } from "@/lib/types";

// A plain trip receipt as text: shared through the phone's share sheet, or copied. Not a GST invoice.
export default function ReceiptButton({ job, vehicleName, driverName }: { job: Job; vehicleName: string; driverName?: string }) {
  const [done, setDone] = useState(false);
  const paid = job.fare_rupees - (job.wallet_discount ?? 0);
  const text = [
    "Pikop trip receipt",
    `Date: ${new Date(job.delivered_at ?? job.created_at).toLocaleString("en-IN")}`,
    `From: ${job.pickup_address}`,
    `To: ${job.drop_address}`,
    `${vehicleName ? vehicleName + " · " : ""}${formatKm(job.distance_m)}`,
    driverName ? `Driver: ${driverName}` : "",
    `Amount paid to the driver: ₹${paid}`,
    "This is a trip receipt, not a tax invoice.",
  ].filter(Boolean).join("\n");

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Pikop receipt", text });
      else {
        await navigator.clipboard.writeText(text);
        setDone(true);
      }
    } catch {
      /* cancelled */
    }
  }
  return (
    <button className="btn" onClick={share}>
      {done ? "Receipt copied" : "Share receipt"}
    </button>
  );
}
