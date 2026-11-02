"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_NAME } from "@/lib/brand";
import { errorText, supabase } from "@/lib/supabase";
import type { ReferralItem, WalletEntry } from "@/lib/types";
import { useT } from "@/i18n";

const LABEL: Record<string, string> = {
  referral_welcome: "Welcome credit",
  referral_reward: "Referral reward",
  ride_discount: "Used on a trip",
  ride_refund: "Refund for a cancelled trip",
  admin_adjust: "Adjustment by Pikop",
};

// Referral code, wallet balance and history for the customer's Account page.
export default function WalletCard() {
  const { t } = useT();
  const [balance, setBalance] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [apply, setApply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ready, setReady] = useState(true);
  const [expiring, setExpiring] = useState<{ amount: number; expires_at: string } | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [b, c, e, r, x] = await Promise.all([
      sb.rpc("my_wallet", { p_wallet: "customer" }),
      sb.rpc("my_referral_code"),
      sb.from("wallet_entries").select("id, amount_rupees, kind, note, created_at").eq("wallet", "customer").order("created_at", { ascending: false }).limit(20),
      sb.rpc("my_referrals", { p_wallet: "customer" }),
      sb.rpc("my_wallet_expiring", { p_wallet: "customer" }),
    ]);
    // Until migration 0007 is applied these calls fail; then the card stays hidden.
    if (b.error || c.error) return setReady(false);
    setBalance(typeof b.data === "number" ? b.data : 0);
    setCode(typeof c.data === "string" ? c.data : "");
    setEntries((e.data as WalletEntry[]) ?? []);
    setReferrals((r.data as ReferralItem[]) ?? []);
    setExpiring(((x.data as { amount: number; expires_at: string }[] | null) ?? [])[0] ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  async function applyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase().rpc("apply_referral_code", { p_code: apply, p_wallet: "customer" });
    if (error) setMsg({ ok: false, text: errorText(error) });
    else {
      setMsg({ ok: true, text: t("Code added. ₹{amount} is now in your wallet.", { amount: Number(data ?? 0) }) });
      setApply("");
      await load();
    }
    setBusy(false);
  }

  if (!ready) return null;
  const share = `https://wa.me/?text=${encodeURIComponent(
    `${t("Send parcels across Bengaluru by bike with {app}. Use my code {code} and we both get credit:", { app: APP_NAME, code })} ${typeof window === "undefined" ? "" : window.location.origin}`,
  )}`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-stone-900 p-4 text-white">
        <p className="text-xs uppercase tracking-wide opacity-70">{t("Wallet")}</p>
        <p className="text-3xl font-extrabold">₹{balance ?? 0}</p>
        {expiring && <p className="mt-1 text-xs text-amber-300">{t("₹{amount} expires on {date}", { amount: expiring.amount, date: new Date(expiring.expires_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) })}</p>}
        <p className="mt-1 text-xs opacity-70">{t("Credit comes off your next trips automatically. You still pay the driver the rest.")}</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-stone-200 p-4">
        <p className="font-semibold">{t("Refer a friend")}</p>
        <p className="text-sm text-stone-600">{t("Your friend gets credit when they join with your code. You get credit once they finish their first delivery.")}</p>
        <div className="rounded-xl bg-orange-50 p-3 text-center">
          <p className="text-xs text-stone-500">{t("Your code")}</p>
          <p className="text-3xl font-extrabold tracking-widest">{code || "······"}</p>
        </div>
        <a className="btn btn-primary w-full" href={share} target="_blank" rel="noreferrer">
          {t("Share on WhatsApp")}
        </a>
        {referrals.length > 0 && (
          <div className="divide-y divide-stone-100">
            {referrals.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span>{r.who}</span>
                <span className={r.status === "rewarded" ? "font-semibold text-green-700" : "text-stone-500"}>
                  {r.status === "rewarded" ? `+₹${r.reward ?? 0}` : r.status === "capped" ? t("Limit reached") : t("Waiting for first delivery")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={applyCode} className="space-y-2 rounded-2xl border border-stone-200 p-4">
        <p className="font-semibold">{t("Have a referral code?")}</p>
        <p className="text-xs text-stone-500">{t("You can add one before your first booking.")}</p>
        <div className="flex gap-2">
          <input className="input uppercase" placeholder="ABC123" maxLength={8} value={apply} onChange={(e) => setApply(e.target.value)} />
          <button className="btn shrink-0" disabled={busy || apply.trim().length < 4}>
            {t("Add code")}
          </button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      </form>

      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">{t("Wallet history")}</p>
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border border-stone-200 p-3 text-sm">
              <div>
                <p className="font-medium">{LABEL[e.kind] ? t(LABEL[e.kind]) : e.kind}</p>
                <p className="text-xs text-stone-500">{new Date(e.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
              </div>
              <span className={`font-semibold ${e.amount_rupees > 0 ? "text-green-700" : "text-stone-700"}`}>
                {e.amount_rupees > 0 ? "+" : "−"}₹{Math.abs(e.amount_rupees)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
