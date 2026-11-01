"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";
import { upiLink, validVpa } from "@/lib/upi";
import type { Driver, Job } from "@/lib/types";

type Via = "cash" | "upi" | "qr";
const TABS: { v: Via; l: string }[] = [
  { v: "cash", l: "Cash" },
  { v: "upi", l: "UPI app" },
  { v: "qr", l: "QR code" },
];

// Customers can pay the driver any time from booking until the parcel is delivered.
export default function PayCard({ job, driver, onChange }: { job: Job; driver: Driver | null; onChange: () => void }) {
  const [tab, setTab] = useState<Via>("cash");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const due = job.fare_rupees - (job.wallet_discount ?? 0);
  const vpa = driver && validVpa(driver.upi_id) ? driver.upi_id : null;
  const link = vpa && driver ? upiLink({ vpa, name: driver.full_name, rupees: due, note: `Pikop order ${job.id.slice(0, 6)}` }) : "";

  useEffect(() => {
    if (tab !== "qr" || !link) return;
    let live = true;
    QRCode.toDataURL(link, { margin: 1, width: 240 }).then((u) => live && setQr(u));
    return () => {
      live = false;
    };
  }, [tab, link]);

  async function mark(via: Via) {
    setBusy(true);
    setError("");
    const { error: e } = await supabase().rpc("customer_mark_paid", { p_job: job.id, p_via: via });
    setBusy(false);
    if (e) return setError(errorText(e));
    onChange();
  }

  const needDriver = (tab === "upi" || tab === "qr") && !driver;
  const noVpa = (tab === "upi" || tab === "qr") && driver && !vpa;

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">Pay the driver</p>
        <p className="text-xl font-extrabold">₹{due}</p>
      </div>
      <p className="mt-0.5 text-xs text-stone-500">Pay any time until the parcel is delivered. The money goes straight to the driver; Pikop never touches it.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TABS.map((o) => (
          <button key={o.v} type="button" onClick={() => setTab(o.v)} className={`rounded-xl border-2 py-2 text-sm font-medium ${tab === o.v ? "border-brand bg-orange-50 text-brand" : "border-stone-200"}`}>
            {o.l}
          </button>
        ))}
      </div>

      <div className="mt-3 text-sm">
        {tab === "cash" && <p className="text-stone-700">Hand ₹{due} in cash to the driver when they are with you.</p>}
        {needDriver && <p className="text-stone-700">A driver has not accepted yet. You can pay by UPI once they do, or choose cash.</p>}
        {noVpa && <p className="text-stone-700">This driver has not added a valid UPI ID. Please pay in cash.</p>}
        {tab === "upi" && link && (
          <>
            <a href={link} className="btn btn-primary w-full">
              Pay ₹{due} with GPay, PhonePe or Paytm
            </a>
            <p className="mt-2 text-xs text-stone-500">Check that your UPI app shows {driver?.full_name} before you confirm. On a computer, scan the QR code instead.</p>
          </>
        )}
        {tab === "qr" && link && (
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt={`UPI QR for ₹${due}`} width={240} height={240} className="mx-auto" />}
            <p className="mt-1 text-xs text-stone-500">Scan with any UPI app. It shows {driver?.full_name} and ₹{due}.</p>
          </div>
        )}
      </div>

      {job.paid_via ? (
        <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">You told us you paid by {job.paid_via === "cash" ? "cash" : job.paid_via === "upi" ? "UPI" : "QR"}. The driver can see this.</p>
      ) : (
        <button className="btn mt-3 w-full" disabled={busy} onClick={() => mark(tab)}>
          I have paid by {tab === "cash" ? "cash" : tab === "upi" ? "UPI" : "QR"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
