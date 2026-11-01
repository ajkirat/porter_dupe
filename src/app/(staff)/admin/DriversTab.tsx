"use client";

import { useState } from "react";
import { errorText, supabase } from "@/lib/supabase";
import { upiLink, validVpa } from "@/lib/upi";
import { KYC_DOCS, type Driver, type DriverPass, type KycStatus } from "@/lib/types";

// KYC review and pass management.
export default function DriversTab({
  drivers,
  activePass,
  reload,
}: {
  drivers: Driver[];
  activePass: Record<string, DriverPass>;
  reload: () => void;
}) {
  const [filter, setFilter] = useState<KycStatus | "all">("pending");
  const [error, setError] = useState("");
  const shown = drivers.filter((d) => filter === "all" || d.kyc_status === filter);

  async function openDoc(path: string) {
    const { data, error } = await supabase().storage.from("kyc").createSignedUrl(path, 300);
    if (error) return setError(errorText(error));
    window.open(data.signedUrl, "_blank");
  }

  async function setKyc(d: Driver, status: KycStatus) {
    const note = status === "rejected" ? prompt("Reason shown to the driver", "Licence photo is not clear") : null;
    if (status === "rejected" && note === null) return;
    const { error } = await supabase().from("drivers").update({ kyc_status: status, kyc_note: note }).eq("id", d.id);
    if (error) setError(errorText(error));
    reload();
  }

  async function addPass(d: Driver, kind: "daily" | "weekly") {
    const note = prompt(`Record a ${kind} pass for ${d.full_name}. Payment reference (optional):`, "");
    if (note === null) return;
    // If the driver has wallet credit (from referrals), offer to use some of it for this pass.
    let wallet = 0;
    const { data: bal } = await supabase().rpc("wallet_balance", { p_user: d.id, p_wallet: "driver" });
    if (typeof bal === "number" && bal > 0) {
      const ans = prompt(`${d.full_name} has ₹${bal} wallet credit. How much of it goes toward this pass? (0 = none)`, "0");
      if (ans === null) return;
      wallet = Math.max(0, Math.trunc(Number(ans)) || 0);
    }
    const { error } = await supabase().rpc("admin_add_pass", { p_driver: d.id, p_kind: kind, p_note: note || null, ...(wallet > 0 ? { p_wallet_rupees: wallet } : {}) });
    if (error) setError(errorText(error));
    reload();
  }

  // Add (or take away) wallet credit by hand, for example a bonus or a correction. The driver sees the reason.
  async function adjustWallet(d: Driver) {
    const { data: bal } = await supabase().rpc("wallet_balance", { p_user: d.id, p_wallet: "driver" });
    const ans = prompt(`${d.full_name}'s wallet: ₹${typeof bal === "number" ? bal : 0}. Add (+) or remove (−) how many ₹?`, "50");
    const amount = Math.trunc(Number(ans));
    if (!amount) return;
    const note = prompt("Reason (the driver sees this):", "Bonus");
    if (!note) return;
    const { error } = await supabase().rpc("admin_adjust_wallet", { p_user: d.id, p_wallet: "driver", p_amount: amount, p_note: note });
    if (error) setError(errorText(error));
    else alert(`Done. Wallet is now ₹${(typeof bal === "number" ? bal : 0) + amount}.`);
  }

  // One-tap payout: opens the admin's UPI app with the driver's ID and amount filled in. Check the payee name it shows.
  function payUpi(d: Driver) {
    if (!validVpa(d.upi_id)) return alert(`${d.full_name} has no valid UPI ID on file.`);
    const rupees = Math.trunc(Number(prompt(`Pay ${d.full_name} (${d.upi_id}) how many ₹?`, "100")));
    if (!rupees || rupees < 1) return;
    window.location.href = upiLink({ vpa: d.upi_id, name: d.full_name, rupees, note: `Pikop ${d.driver_code ?? ""}`.trim() });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button key={f} className={`btn py-1.5 ${filter === f ? "btn-primary" : ""}`} onClick={() => setFilter(f)}>
            {f} ({f === "all" ? drivers.length : drivers.filter((d) => d.kyc_status === f).length})
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {shown.length === 0 && <p className="text-sm text-stone-500">No drivers here.</p>}
      {shown.map((d) => {
        const pass = activePass[d.id];
        return (
          <div key={d.id} className="card space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                <span className="mr-2 rounded-md bg-stone-900 px-1.5 py-0.5 font-mono text-xs text-white">{d.driver_code ?? "—"}</span>
                {d.full_name} <span className="font-normal text-stone-500">· {d.phone}</span>
              </p>
              <span className="text-xs text-stone-500">
                {d.is_online ? "Online" : "Offline"}
                {d.last_seen_at && ` · seen ${new Date(d.last_seen_at).toLocaleString("en-IN")}`}
              </span>
            </div>
            <p className="text-stone-600">
              {d.vehicle_type} · {d.vehicle_number} {d.licence_number && `· licence ${d.licence_number}`} {d.upi_id && `· UPI ${d.upi_id}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {KYC_DOCS.map((doc) =>
                d.kyc_docs[doc.key] ? (
                  <button key={doc.key} className="btn py-1 text-xs" onClick={() => openDoc(d.kyc_docs[doc.key])}>
                    {doc.label}
                  </button>
                ) : (
                  <span key={doc.key} className="text-xs text-red-600">
                    {doc.label} missing
                  </span>
                ),
              )}
              {d.kyc_docs.selfie && (
                <button className="btn py-1 text-xs" onClick={() => openDoc(d.kyc_docs.selfie)}>
                  Signup selfie
                </button>
              )}
              {d.last_selfie_path && (
                <button className="btn py-1 text-xs" onClick={() => openDoc(d.last_selfie_path!)}>
                  Last online selfie{d.last_selfie_at && ` (${new Date(d.last_selfie_at).toLocaleString("en-IN")})`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2">
              {d.kyc_status !== "approved" && (
                <button className="btn btn-primary py-1.5" onClick={() => setKyc(d, "approved")}>
                  Approve
                </button>
              )}
              {d.kyc_status !== "rejected" && (
                <button className="btn btn-danger py-1.5" onClick={() => setKyc(d, "rejected")}>
                  {d.kyc_status === "approved" ? "Suspend" : "Reject"}
                </button>
              )}
              {d.kyc_status === "approved" && (
                <>
                  <span className="text-xs text-stone-600">
                    {pass ? `Pass until ${new Date(pass.ends_at).toLocaleString("en-IN")}` : "No active pass"}
                  </span>
                  <button className="btn py-1.5" onClick={() => addPass(d, "daily")}>
                    + Day pass
                  </button>
                  <button className="btn py-1.5" onClick={() => addPass(d, "weekly")}>
                    + Week pass
                  </button>
                  <button className="btn py-1.5" onClick={() => adjustWallet(d)}>
                    ± Wallet
                  </button>
                  {validVpa(d.upi_id) && (
                    <button className="btn py-1.5" onClick={() => payUpi(d)}>
                      Pay by UPI
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
