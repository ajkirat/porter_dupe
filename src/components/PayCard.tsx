"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";
import { upiAppLinks, upiLink, validVpa } from "@/lib/upi";
import type { Driver, Job } from "@/lib/types";
import { useT } from "@/i18n";

type Via = "cash" | "upi" | "qr";
const TABS: { v: Via; l: string }[] = [
  { v: "cash", l: "Cash" },
  { v: "upi", l: "UPI app" },
  { v: "qr", l: "QR code" },
];

// Customers can pay the driver any time from booking until the parcel is delivered.
export default function PayCard({ job, driver, onChange }: { job: Job; driver: Driver | null; onChange: () => void }) {
  const { t } = useT();
  const [tab, setTab] = useState<Via>("cash");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const due = job.fare_rupees - (job.wallet_discount ?? 0);
  const vpa = driver && validVpa(driver.upi_id) ? driver.upi_id : null;
  const pay = vpa && driver ? { vpa, name: driver.full_name, rupees: due, note: `Pikop order ${job.id.slice(0, 6)}` } : null;
  const link = pay ? upiLink(pay) : "";
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

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
        <p className="font-semibold">{t("Pay the driver")}</p>
        <p className="text-xl font-extrabold">₹{due}</p>
      </div>
      <p className="mt-0.5 text-xs text-stone-500">{t("Pay now that the trip is complete. The money goes straight to the driver; Pikop never touches it.")}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TABS.map((o) => (
          <button key={o.v} type="button" onClick={() => setTab(o.v)} className={`rounded-xl border-2 py-2 text-sm font-medium ${tab === o.v ? "border-brand bg-orange-50 text-brand" : "border-stone-200"}`}>
            {t(o.l)}
          </button>
        ))}
      </div>

      <div className="mt-3 text-sm">
        {tab === "cash" && <p className="text-stone-700">{t("Hand ₹{due} in cash to the driver when they are with you.", { due })}</p>}
        {needDriver && <p className="text-stone-700">{t("This driver is not available for UPI. Please pay in cash.")}</p>}
        {noVpa && <p className="text-stone-700">{t("This driver has not added a valid UPI ID. Please pay in cash.")}</p>}
        {tab === "upi" && link && (
          <>
            <p className="mb-2 font-medium">{t("Pay ₹{due} with your UPI app", { due })}</p>
            <div className="grid grid-cols-2 gap-2">
              {pay &&
                upiAppLinks(pay, ios).map((a, i) => (
                  <a key={a.id} href={a.href} className={`btn ${i === 0 ? "btn-primary" : ""}`}>
                    {a.label}
                  </a>
                ))}
            </div>
            <p className="mt-2 text-xs text-stone-500">{t("Pick the app you use. If nothing opens, that app isn't installed: try another, or use the QR tab. Check that it shows {name} before you confirm.", { name: driver?.full_name ?? "" })}</p>
          </>
        )}
        {tab === "qr" && link && (
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt={`UPI QR for ₹${due}`} width={240} height={240} className="mx-auto" />}
            <p className="mt-1 text-xs text-stone-500">{t("Scan with any UPI app. It shows {name} and ₹{due}.", { name: driver?.full_name ?? "", due })}</p>
          </div>
        )}
      </div>

      {job.paid_via ? (
        <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">{t("You told us you paid. The driver can see this.")}</p>
      ) : (
        <button className="btn mt-3 w-full" disabled={busy} onClick={() => mark(tab)}>
          {t("I have paid")} ({t(TABS.find((o) => o.v === tab)!.l)})
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
