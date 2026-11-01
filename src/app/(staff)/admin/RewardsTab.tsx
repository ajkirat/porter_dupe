"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";
import type { RewardSettings } from "@/lib/types";

type Entry = { id: string; user_id: string; wallet: "customer" | "driver"; amount_rupees: number; kind: string; note: string | null; created_at: string };
type Referral = { id: string; referrer_id: string; referred_id: string; wallet: "customer" | "driver"; status: string; created_at: string; rewarded_at: string | null };
type Person = { id: string; full_name: string | null; phone: string | null; driver_code?: string };

const KIND: Record<string, string> = {
  referral_welcome: "Welcome credit",
  referral_reward: "Referral reward",
  ride_discount: "Used on a trip",
  ride_refund: "Trip refund",
  ride_compensation: "Paid to driver for a discount",
  pass_payment: "Used on a pass",
  admin_adjust: "Admin adjustment",
};

const NUMBERS: { key: keyof RewardSettings; label: string; hint?: string }[] = [
  { key: "referral_driver_reward", label: "Driver referral reward (₹)", hint: "Paid to the referring driver" },
  { key: "referral_customer_welcome", label: "New customer credit (₹)", hint: "Given to the new customer when they add a code" },
  { key: "referral_customer_reward", label: "Customer referral reward (₹)", hint: "Paid to the referring customer" },
  { key: "referral_max_driver", label: "Max paid referrals per driver" },
  { key: "referral_max_customer", label: "Max paid referrals per customer" },
  { key: "referral_min_trip_m", label: "First trip must be at least (metres)", hint: "Shorter trips do not count" },
  { key: "referral_min_fare", label: "First trip fare must be at least (₹)" },
  { key: "wallet_max_percent", label: "Wallet can cover at most (% of a fare)" },
];

const who = (p?: Person) => (p ? [p.driver_code, p.full_name, p.phone].filter(Boolean).join(" · ") || p.id.slice(0, 8) : "unknown");

export default function RewardsTab() {
  const [s, setS] = useState<RewardSettings | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [msg, setMsg] = useState("");
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [st, en, rf] = await Promise.all([
      sb.from("settings").select("referral_driver_enabled, referral_customer_enabled, referral_driver_reward, referral_customer_reward, referral_customer_welcome, referral_max_driver, referral_max_customer, referral_min_trip_m, referral_min_fare, wallet_max_percent").single(),
      sb.from("wallet_entries").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("referrals").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    if (st.error) return setMissing(true); // migration 0007 not applied yet
    setS(st.data as RewardSettings);
    const e = (en.data as Entry[]) ?? [];
    const r = (rf.data as Referral[]) ?? [];
    setEntries(e);
    setReferrals(r);
    const ids = [...new Set([...e.map((x) => x.user_id), ...r.flatMap((x) => [x.referrer_id, x.referred_id])])];
    if (ids.length) {
      const { data } = await sb.from("profiles").select("id, full_name, phone").in("id", ids);
      const { data: ds } = await sb.from("drivers").select("id, full_name, phone, driver_code").in("id", ids);
      const map: Record<string, Person> = {};
      for (const p of (data as Person[]) ?? []) map[p.id] = p;
      for (const d of (ds as Person[]) ?? []) map[d.id] = { ...map[d.id], ...d, full_name: d.full_name };
      setPeople(map);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const t = { customer: { given: 0, spent: 0 }, driver: { given: 0, spent: 0 } };
    const bal: Record<string, { wallet: "customer" | "driver"; user: string; amount: number }> = {};
    for (const e of entries) {
      if (e.amount_rupees > 0) t[e.wallet].given += e.amount_rupees;
      else t[e.wallet].spent += -e.amount_rupees;
      const k = `${e.wallet}:${e.user_id}`;
      bal[k] = bal[k] ?? { wallet: e.wallet, user: e.user_id, amount: 0 };
      bal[k].amount += e.amount_rupees;
    }
    return { t, balances: Object.values(bal).filter((b) => b.amount !== 0).sort((a, b) => b.amount - a.amount) };
  }, [entries]);

  if (missing) return <p className="card text-sm">Referrals are not set up yet. Run migration <code>0007_referrals_wallet.sql</code> in the Supabase SQL Editor.</p>;
  if (!s) return <p className="text-stone-500">Loading…</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("settings").update({ ...s, updated_at: new Date().toISOString() }).eq("id", true);
    setMsg(error ? errorText(error) : "Saved. New rules apply from now on.");
  }

  async function adjust(user: string, wallet: "customer" | "driver") {
    const amount = Number(prompt(`Add (+) or remove (−) wallet credit for ${who(people[user])}. Amount in ₹:`, "50"));
    if (!amount) return;
    const note = prompt("Reason (the person sees this):", "Goodwill");
    if (!note) return;
    const { error } = await supabase().rpc("admin_adjust_wallet", { p_user: user, p_wallet: wallet, p_amount: Math.trunc(amount), p_note: note });
    if (error) setMsg(errorText(error));
    else {
      setMsg("Adjusted.");
      load();
    }
  }

  const set = <K extends keyof RewardSettings>(k: K, v: RewardSettings[K]) => {
    setMsg("");
    setS({ ...s, [k]: v });
  };

  const km = (s.referral_min_trip_m / 1000).toFixed(1).replace(/\.0$/, "");
  const outstanding = (w: "customer" | "driver") => totals.t[w].given - totals.t[w].spent;
  const counts = (st: string) => referrals.filter((r) => r.status === st).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs text-stone-500">Customer credit outstanding</p>
          <p className="text-2xl font-bold">₹{outstanding("customer")}</p>
          <p className="text-xs text-stone-500">given ₹{totals.t.customer.given} · used ₹{totals.t.customer.spent}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Driver credit outstanding</p>
          <p className="text-2xl font-bold">₹{outstanding("driver")}</p>
          <p className="text-xs text-stone-500">given ₹{totals.t.driver.given} · used ₹{totals.t.driver.spent}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Referrals</p>
          <p className="text-2xl font-bold">{referrals.length}</p>
          <p className="text-xs text-stone-500">{counts("pending")} waiting · {counts("rewarded")} paid · {counts("capped")} over the limit</p>
        </div>
      </div>

      <form onSubmit={save} className="card max-w-2xl space-y-4">
        <h2 className="font-semibold">Rules</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.referral_driver_enabled} onChange={(e) => set("referral_driver_enabled", e.target.checked)} />
            Driver referrals are on
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.referral_customer_enabled} onChange={(e) => set("referral_customer_enabled", e.target.checked)} />
            Customer referrals are on
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMBERS.map((f) => (
            <label key={f.key} className="label">
              {f.label}
              <input className="input" type="number" min="0" step="1" value={s[f.key] as number} onChange={(e) => set(f.key, Math.max(0, Math.trunc(Number(e.target.value))) as never)} />
              {f.hint && <span className="text-xs font-normal text-stone-500">{f.hint}</span>}
            </label>
          ))}
        </div>
        <div className="space-y-1 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
          <p className="font-medium">What these rules do, in plain words</p>
          <p>
            <b>IF</b> driver referrals are {s.referral_driver_enabled ? "on" : "off"} <b>AND</b> a new driver adds a code before their first delivery <b>AND</b> they deliver a trip of at least {km} km
            {s.referral_min_fare > 0 && <> and ₹{s.referral_min_fare}</>} <b>THEN</b> the referring driver gets ₹{s.referral_driver_reward} (up to {s.referral_max_driver} drivers).
          </p>
          <p>
            <b>IF</b> customer referrals are {s.referral_customer_enabled ? "on" : "off"} <b>AND</b> a new customer adds a code before booking <b>THEN</b> they get ₹{s.referral_customer_welcome} right away,
            <b> AND IF</b> their first trip (at least {km} km) is delivered <b>THEN</b> the referrer gets ₹{s.referral_customer_reward} (up to {s.referral_max_customer} friends).
          </p>
          <p>
            <b>IF</b> a customer has credit <b>THEN</b> it covers at most {s.wallet_max_percent}% of a fare. Pikop pays the driver that amount as wallet credit after delivery.
          </p>
        </div>
        <button className="btn btn-primary w-full">Save rules</button>
        {msg && <p className="text-sm text-stone-600">{msg}</p>}
      </form>

      <div className="space-y-2">
        <h2 className="font-semibold">Wallet balances</h2>
        {totals.balances.length === 0 && <p className="card text-sm text-stone-500">No credit has been given yet.</p>}
        {totals.balances.map((b) => (
          <div key={b.wallet + b.user} className="card flex items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium">{who(people[b.user])}</p>
              <p className="text-xs text-stone-500">{b.wallet} wallet</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold">₹{b.amount}</span>
              <button className="btn py-1.5" onClick={() => adjust(b.user, b.wallet)}>Adjust</button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Referrals</h2>
        {referrals.length === 0 && <p className="card text-sm text-stone-500">No referrals yet.</p>}
        {referrals.map((r) => (
          <div key={r.id} className="card p-3 text-sm">
            <p>
              <b>{who(people[r.referrer_id])}</b> referred <b>{who(people[r.referred_id])}</b>
            </p>
            <p className="text-xs text-stone-500">
              {r.wallet} · {r.status === "pending" ? "waiting for their first delivery" : r.status === "rewarded" ? "reward paid" : "over the limit, not paid"} · {new Date(r.created_at).toLocaleDateString("en-IN")}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Recent wallet activity</h2>
        {entries.slice(0, 40).map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 text-sm">
            <div>
              <p className="font-medium">{KIND[e.kind] ?? e.kind} · {e.wallet}</p>
              <p className="text-xs text-stone-500">{who(people[e.user_id])} · {new Date(e.created_at).toLocaleString("en-IN")}{e.note ? ` · ${e.note}` : ""}</p>
            </div>
            <span className={`font-semibold ${e.amount_rupees > 0 ? "text-green-700" : "text-stone-700"}`}>{e.amount_rupees > 0 ? "+" : "−"}₹{Math.abs(e.amount_rupees)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
