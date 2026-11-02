"use client";

import { useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";

export const FLOWS = [
  { flow: "driver_driver", tab: "Driver → Driver", from: "A driver", to: "a new driver" },
  { flow: "driver_customer", tab: "Driver → Customer", from: "A driver", to: "a new customer" },
  { flow: "customer_driver", tab: "Customer → Driver", from: "A customer", to: "a new driver" },
  { flow: "customer_customer", tab: "Customer → Customer", from: "A customer", to: "a new customer" },
  { flow: "pikop_driver", tab: "Pikop → Driver", from: "Pikop", to: "a new driver" },
  { flow: "pikop_customer", tab: "Pikop → Customer", from: "Pikop", to: "a new customer" },
] as const;

type Rule = {
  flow: string; enabled: boolean; referrer_reward: number; referred_reward: number;
  referred_when: "signup" | "trips"; trips: number; monthly_cap: number; starts_at: string | null;
};

// One screen per direction. Pikop is the party that refers nobody: its "referral" is a bonus for newcomers who came on their own.
export default function ReferralFlows({ flow }: { flow: (typeof FLOWS)[number]["flow"] }) {
  const meta = FLOWS.find((f) => f.flow === flow)!;
  const pikop = flow.startsWith("pikop");
  const toWord = flow.endsWith("driver") ? "driver" : "customer";
  const [r, setR] = useState<Rule | null>(null);
  const [msg, setMsg] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    supabase().from("referral_rules").select("*").eq("flow", flow).single().then(({ data, error }) => {
      if (error) setMissing(true);
      else setR(data as Rule);
    });
  }, [flow]);

  if (missing) return <p className="card text-sm">Referral flows are not set up yet. Run migration <code>0016_referral_flows.sql</code> in the Supabase SQL Editor.</p>;
  if (!r) return <p className="text-stone-500">Loading…</p>;

  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => { setMsg(""); setR({ ...r, [k]: v }); };
  const num = (k: "referrer_reward" | "referred_reward" | "trips" | "monthly_cap", min = 0) => (
    <input className="input" type="number" min={min} step="1" value={r[k]} onChange={(e) => set(k, Math.max(min, Math.trunc(Number(e.target.value))) as never)} />
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!r) return;
    // Pikop bonuses only reach people who join after the switch-on moment, so old users do not suddenly get paid.
    let starts = r.starts_at;
    if (pikop && r.enabled && !starts) starts = new Date().toISOString();
    if (pikop && !r.enabled) starts = null;
    const { error } = await supabase().from("referral_rules").update({
      enabled: r.enabled, referrer_reward: pikop ? 0 : r.referrer_reward, referred_reward: r.referred_reward,
      referred_when: pikop ? "trips" : r.referred_when, trips: r.trips, monthly_cap: r.monthly_cap, starts_at: starts, updated_at: new Date().toISOString(),
    }).eq("flow", flow);
    setMsg(error ? errorText(error) : "Saved. New rules apply from now on.");
    if (!error) setR({ ...r, starts_at: starts });
  }

  return (
    <form onSubmit={save} className="card max-w-2xl space-y-4">
      <div>
        <h2 className="font-semibold">{meta.tab}</h2>
        <p className="text-sm text-stone-600">
          {pikop
            ? `Pikop gives a welcome bonus to ${meta.to} who joined on their own, with no referral code.`
            : `${meta.from} shares their code. ${meta.to[0].toUpperCase() + meta.to.slice(1)} adds it${toWord === "driver" ? " before their first delivery" : " before their first booking"}.`}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={r.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        This flow is on
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {!pikop && (
          <label className="label">
            Reward for the one who referred (₹)
            {num("referrer_reward")}
            <span className="text-xs font-normal text-stone-500">Goes to their own wallet ({flow.startsWith("driver") ? "driver" : "customer"} wallet)</span>
          </label>
        )}
        <label className="label">
          {pikop ? `Welcome bonus for the new ${toWord} (₹)` : `Credit for the new ${toWord} (₹)`}
          {num("referred_reward")}
          <span className="text-xs font-normal text-stone-500">Goes to their {toWord} wallet</span>
        </label>
        <label className="label">
          Deliveries the new {toWord} must complete
          {num("trips", 1)}
          <span className="text-xs font-normal text-stone-500">The reward is paid after this many deliveries</span>
        </label>
        {!pikop && (
          <label className="label">
            The new {toWord} gets their credit
            <select className="input" value={r.referred_when} onChange={(e) => set("referred_when", e.target.value as Rule["referred_when"])}>
              <option value="signup">Right away, when they add the code</option>
              <option value="trips">After they complete the deliveries set above</option>
            </select>
          </label>
        )}
        {!pikop && (
          <label className="label">
            Most paid referrals per person each month
            {num("monthly_cap")}
          </label>
        )}
      </div>
      <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
        <p className="mb-1 font-medium">In plain words</p>
        {!r.enabled ? (
          <p>This flow is off. Nothing is paid.</p>
        ) : pikop ? (
          <p>
            Any new {toWord} who joins from now on, without a code, gets ₹{r.referred_reward} in their wallet after {r.trips} deliveries. Once per person.
            {r.starts_at && <> Applies to people who joined after {new Date(r.starts_at).toLocaleString("en-IN")}.</>}
          </p>
        ) : (
          <p>
            {meta.from} refers {meta.to}. {r.referred_when === "signup" ? `The new ${toWord} gets ₹${r.referred_reward} right away. ` : r.referred_reward > 0 ? `The new ${toWord} gets ₹${r.referred_reward} after ${r.trips} deliveries. ` : ""}
            After {r.trips} deliveries by the new {toWord}, the referrer gets ₹{r.referrer_reward}, up to {r.monthly_cap} a month.
          </p>
        )}
      </div>
      <button className="btn btn-primary w-full">Save</button>
      {msg && <p className="text-sm text-stone-600">{msg}</p>}
    </form>
  );
}
