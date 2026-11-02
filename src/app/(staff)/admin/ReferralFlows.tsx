"use client";

import { useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";

export const FLOWS = [
  { flow: "driver_driver", tab: "Driver → Driver" },
  { flow: "driver_customer", tab: "Driver → Customer" },
  { flow: "customer_driver", tab: "Customer → Driver" },
  { flow: "customer_customer", tab: "Customer → Customer" },
  { flow: "pikop_driver", tab: "Pikop → Driver" },
  { flow: "pikop_customer", tab: "Pikop → Customer" },
] as const;
type FlowId = (typeof FLOWS)[number]["flow"];

// Each name is used in one section only, so an example can never be confused with another section's.
const NAMES: Record<FlowId, [string, string]> = {
  driver_driver: ["Ramesh", "Suresh"],
  driver_customer: ["Mahesh", "Anita"],
  customer_driver: ["Kavita", "Manoj"],
  customer_customer: ["Priya", "Rohan"],
  pikop_driver: ["", "Deepak"],
  pikop_customer: ["", "Sunita"],
};

type Rule = {
  flow: string; enabled: boolean; referrer_reward: number; referred_reward: number;
  referred_when: "signup" | "trips"; trips: number; monthly_cap: number; starts_at: string | null;
};
type Globals = { daily_pass_price: number; referral_min_trip_m: number; wallet_max_percent: number };
type Impact = { tone: "good" | "bad" | "neutral"; text: string };

const roleOf = (f: string) => ({ from: f.split("_")[0], to: f.split("_")[1] });
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// Inline number box that sits inside a sentence.
function Num({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <input
      className="mx-1 inline-block w-20 rounded-lg border-2 border-orange-300 bg-orange-50 px-2 py-0.5 text-center font-semibold outline-none focus:border-brand"
      type="number" min={min} step="1" value={value}
      onChange={(e) => onChange(Math.max(min, Math.trunc(Number(e.target.value)) || min))}
    />
  );
}

export default function ReferralFlows({ flow, preview }: { flow: FlowId; preview?: { rules: Rule[]; globals: Globals } }) {
  const { from, to } = roleOf(flow);
  const pikop = from === "pikop";
  const [ref, nw] = NAMES[flow];
  const [r, setR] = useState<Rule | null>(preview?.rules.find((x) => x.flow === flow) ?? null);
  const [others, setOthers] = useState<Rule[]>(preview?.rules.filter((x) => x.flow !== flow) ?? []);
  const [g, setG] = useState<Globals>(preview?.globals ?? { daily_pass_price: 75, referral_min_trip_m: 1000, wallet_max_percent: 50 });
  const [msg, setMsg] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (preview) return;
    const sb = supabase();
    sb.from("referral_rules").select("*").then(({ data, error }) => {
      if (error) return setMissing(true);
      const all = (data as Rule[]) ?? [];
      setR(all.find((x) => x.flow === flow) ?? null);
      setOthers(all.filter((x) => x.flow !== flow));
    });
    sb.from("settings").select("daily_pass_price, referral_min_trip_m, wallet_max_percent").single().then(({ data }) => data && setG(data as Globals));
  }, [flow, preview]);

  if (missing) return <p className="card text-sm">Referral flows are not set up yet. Run migration <code>0016_referral_flows.sql</code> in the Supabase SQL Editor.</p>;
  if (!r) return <p className="text-stone-500">Loading…</p>;

  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => { setMsg(""); setR({ ...r, [k]: v }); };

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

  const km = (g.referral_min_trip_m / 1000).toFixed(1).replace(/\.0$/, "");
  const R = pikop ? 0 : r.referrer_reward, X = r.referred_reward, N = r.trips, C = r.monthly_cap;
  const days = (n: number) => Math.floor(n / Math.max(1, g.daily_pass_price));

  // ---- worked example, with the real rupee outcome ----
  const example: string[] = [];
  if (!r.enabled) example.push("This flow is switched off right now, so nothing is paid. This is what would happen if you switched it on.");
  if (pikop) {
    example.push(`${nw} joins as a new ${to} on their own, with no referral code, and completes ${N} deliveries of at least ${km} km each.`);
    example.push(X > 0
      ? `${nw} then gets ${inr(X)} once in their ${to} wallet${to === "driver" ? `, about ${days(X)} day pass${days(X) === 1 ? "" : "es"} (a day pass is ${inr(g.daily_pass_price)})` : ""}. Pikop gives away ${inr(X)} for this person. For 100 such people that is ${inr(X * 100)}.`
      : "The bonus is ₹0, so nothing is paid.");
  } else {
    example.push(`${ref} shares their code. ${nw} joins as a new ${to}, adds the code ${to === "driver" ? "before their first delivery" : "before their first booking"}, and completes ${N} deliveries of at least ${km} km each.`);
    example.push(R > 0
      ? `${ref} gets ${inr(R)} in their ${from} wallet${from === "driver" ? `, about ${days(R)} day pass${days(R) === 1 ? "" : "es"}` : ""}.`
      : `${ref} gets nothing (the reward is ₹0).`);
    example.push(X > 0
      ? `${nw} gets ${inr(X)} in their ${to} wallet ${r.referred_when === "signup" ? `right away, even if ${nw} never finishes a delivery, so Pikop pays this even when no reward follows` : `after the ${N} deliveries`}.`
      : `${nw} gets no credit (the credit is ₹0).`);
    example.push(`Pikop gives away ${inr(R + X)} for this one referral.`);
    if (C > 0 && R > 0) example.push(`If ${ref} brings ${C + 1} people in one month and all finish ${N} deliveries, only the first ${C} pay out: ${inr(R * C)} to ${ref}. The next one earns ${ref} nothing. The most ${ref} can earn from this flow in a month is ${inr(R * C)}, plus ${inr(X)} for each new person.`);
    if (C === 0 && R > 0) example.push("The monthly limit is 0, so the referrer is never paid.");
  }
  const costNote = (to === "customer" || from === "customer")
    ? "Customer-wallet credit is used against fares. Pikop then pays the driver the same amount, so every ₹1 of customer credit costs Pikop ₹1."
    : "Driver-wallet credit is used for passes, so every ₹1 of credit is ₹1 of pass fee you do not collect.";

  // ---- what this change does to the other sections ----
  const all = [r, ...others];
  const impacts: Impact[] = [];
  const name = (f: string) => FLOWS.find((x) => x.flow === f)!.tab;
  for (const o of others) {
    const oRole = roleOf(o.flow);
    const oPikop = oRole.from === "pikop";
    if (!pikop && oPikop && oRole.to === to) {
      if (!o.enabled) impacts.push({ tone: "neutral", text: `${name(o.flow)} is off, so this is the only welcome offer for a new ${to}.` });
      else if (o.referred_reward > X) impacts.push({ tone: "bad", text: `${name(o.flow)}: a new ${to} gets ${inr(o.referred_reward)} there for joining alone, but only ${inr(X)} here. People may skip the code, so ${from}s earn fewer referral rewards. Raise the credit here or lower the Pikop bonus.` });
      else impacts.push({ tone: "good", text: `${name(o.flow)}: joining alone gives ${inr(o.referred_reward)}, less than the ${inr(X)} here, so using a code stays the better deal.` });
    } else if (pikop && !oPikop && oRole.to === to) {
      if (!o.enabled) continue;
      if (X > o.referred_reward) impacts.push({ tone: "bad", text: `${name(o.flow)}: your bonus of ${inr(X)} is more than the ${inr(o.referred_reward)} a new ${to} gets there with a code. People may skip codes, which hurts that flow.` });
      else impacts.push({ tone: "good", text: `${name(o.flow)}: your bonus of ${inr(X)} is not higher than the ${inr(o.referred_reward)} there, so codes stay attractive.` });
    } else if (!pikop && !oPikop && oRole.to === to) {
      impacts.push({ tone: "neutral", text: `${name(o.flow)}: a new ${to} can also arrive that way. The new ${to} gets ${inr(X)} here and ${inr(o.referred_reward)} there, the referrer ${inr(R)} here and ${inr(o.referrer_reward)} there. If these differ a lot, people steer to the better one.${o.trips !== N ? ` The new ${to} needs ${N} deliveries here but ${o.trips} there.` : ""}` });
    } else if (!pikop && !oPikop && oRole.from === from) {
      const total = R * C + o.referrer_reward * o.monthly_cap;
      impacts.push({ tone: total > R * C ? "bad" : "neutral", text: `${name(o.flow)}: the same ${from} can earn from both flows. Limits are counted separately for each flow, so one ${from} can earn up to ${inr(total)} a month in total.` });
    }
  }
  if (!pikop && !r.enabled) impacts.push({ tone: "neutral", text: `Referrals already waiting in this flow are closed with no payment when the new ${to} next delivers.` });
  if (!pikop && all.some((x) => x.enabled && roleOf(x.flow).to === "customer") && (to === "customer" || from === "customer"))
    impacts.push({ tone: "neutral", text: `Wallet limits tab: a customer wallet covers at most ${g.wallet_max_percent}% of a fare, so a large customer credit takes several trips to use up.` });
  impacts.push({ tone: "neutral", text: `Wallet limits tab: trips shorter than ${km} km do not count in any flow, so changing that changes every section.` });

  const toneCls = { good: "text-green-700", bad: "text-red-700", neutral: "text-stone-600" } as const;
  const toneTxt = { good: "Helps", bad: "Watch out", neutral: "Note" } as const;

  const Ref = from === "driver" ? "a driver" : "a customer";
  const newer = to === "driver" ? (from === "driver" ? "another driver" : "a new driver") : (from === "customer" ? "another customer" : "a new customer");

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="card max-w-2xl space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={r.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          This section is switched on
        </label>

        {pikop ? (
          <p className="text-[17px] leading-10">
            As Pikop, if a new {to} like <b>{nw}</b> joins on their own, with no referral code, then after {nw} completes
            <Num value={N} min={1} onChange={(v) => set("trips", v)} />
            deliveries, Pikop gives {nw} a welcome bonus of ₹
            <Num value={X} onChange={(v) => set("referred_reward", v)} />
            in their {to} wallet. Each person gets this once, and only people who joined after this section was switched on.
          </p>
        ) : (
          <div className="space-y-2 text-[17px] leading-10">
            <p>
              As {Ref} (say, <b>{ref}</b>), if I refer {newer} (say, <b>{nw}</b>), then:
            </p>
            <p>
              • After {nw} completes
              <Num value={N} min={1} onChange={(v) => set("trips", v)} />
              deliveries, I get ₹
              <Num value={R} onChange={(v) => set("referrer_reward", v)} />
              in my {from} wallet. I can earn this for up to
              <Num value={C} onChange={(v) => set("monthly_cap", v)} />
              referrals a month.
            </p>
            <p>
              • {nw} gets ₹
              <Num value={X} onChange={(v) => set("referred_reward", v)} />
              in their {to} wallet
              <select
                className="mx-1 rounded-lg border-2 border-orange-300 bg-orange-50 px-2 py-0.5 font-semibold outline-none"
                value={r.referred_when}
                onChange={(e) => set("referred_when", e.target.value as Rule["referred_when"])}
              >
                <option value="signup">right away, when they add my code</option>
                <option value="trips">only after those {N} deliveries</option>
              </select>
              .
            </p>
          </div>
        )}
        <button className="btn btn-primary w-full">Save</button>
        {msg && <p className="text-sm text-stone-600">{msg}</p>}
      </div>

      <div className="card max-w-2xl space-y-3 bg-stone-50 text-sm text-stone-700">
        <div>
          <p className="font-semibold">Example, with real rupees</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {example.map((t, i) => <li key={i}>{t}</li>)}
            <li>{costNote}</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold">What this section changes elsewhere</p>
          <ul className="mt-1 space-y-1.5">
            {impacts.map((im, i) => (
              <li key={i}><span className={`mr-1 font-semibold ${toneCls[im.tone]}`}>{toneTxt[im.tone]}:</span>{im.text}</li>
            ))}
          </ul>
        </div>
      </div>
    </form>
  );
}
