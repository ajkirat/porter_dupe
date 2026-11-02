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

// Inline number box that sits inside a sentence. Greyed out when nothing depends on it.
function Num({ value, onChange, min = 0, disabled = false, inline = true }: { value: number; onChange: (n: number) => void; min?: number; disabled?: boolean; inline?: boolean }) {
  const base = inline ? "mx-1 inline-block w-20 rounded-lg border-2 px-2 py-0.5 text-center font-semibold outline-none" : "input";
  const tone = inline ? (disabled ? "border-stone-200 bg-stone-100 text-stone-400" : "border-orange-300 bg-orange-50 focus:border-brand") : disabled ? "bg-stone-100 text-stone-400" : "";
  return (
    <input
      className={`${base} ${tone}`}
      type="number" min={min} step="1" value={value} disabled={disabled}
      onChange={(e) => onChange(Math.max(min, Math.trunc(Number(e.target.value)) || 0))}
    />
  );
}

export default function ReferralFlows({ flow, preview }: { flow: FlowId; preview?: { rules: Rule[]; globals: Globals; view?: "sentence" | "form" } }) {
  const { from, to } = roleOf(flow);
  const pikop = from === "pikop";
  const [ref, nw] = NAMES[flow];
  const [r, setR] = useState<Rule | null>(preview?.rules.find((x) => x.flow === flow) ?? null);
  const [others, setOthers] = useState<Rule[]>(preview?.rules.filter((x) => x.flow !== flow) ?? []);
  const [g, setG] = useState<Globals>(preview?.globals ?? { daily_pass_price: 75, referral_min_trip_m: 1000, wallet_max_percent: 50 });
  const [view, setView] = useState<"sentence" | "form">(preview?.view ?? "sentence");
  const [msg, setMsg] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("referral-view");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved choice
      if (v === "form" || v === "sentence") setView(v);
    } catch { /* private mode */ }
  }, []);

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

  const pick = (v: "sentence" | "form") => {
    setView(v);
    try { localStorage.setItem("referral-view", v); } catch { /* ignore */ }
  };
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
  // What actually depends on what: grey out a field when changing it would change nothing.
  const tripsUsed = pikop ? X > 0 : R > 0 || (X > 0 && r.referred_when === "trips");
  const capUsed = !pikop && R > 0;
  const whenUsed = !pikop && X > 0;
  const nowOrAfter = N === 0;
  const days = (n: number) => Math.floor(n / Math.max(1, g.daily_pass_price));

  // ---- worked example, with the real rupee outcome ----
  const doing = tripsUsed && N > 0 ? `completes ${N} deliveries of at least ${km} km each` : "";
  const example: string[] = [];
  if (!r.enabled) example.push("This section is switched off right now, so nothing is paid. This is what would happen if you switched it on.");
  if (pikop) {
    example.push(`New ${to} ${nw} joins on their own, with no referral code${X > 0 && N > 0 ? ` and completes ${N} deliveries of at least ${km} km each` : X > 0 ? " and completes their first delivery" : ""}.`);
    example.push(X > 0
      ? `${nw} then gets ${inr(X)} once in their ${to} wallet${to === "driver" ? `, about ${days(X)} day pass${days(X) === 1 ? "" : "es"} (a day pass is ${inr(g.daily_pass_price)})` : ""}. Pikop gives away ${inr(X)} for this person. For 100 such people that is ${inr(X * 100)}.`
      : "The bonus is ₹0, so nothing is paid.");
  } else {
    example.push(`${from[0].toUpperCase() + from.slice(1)} ${ref} shares their code. New ${to} ${nw} adds it ${to === "driver" ? "before their first delivery" : "before their first booking"}${doing ? ` and ${doing}` : ""}.`);
    example.push(R > 0
      ? `${ref} gets ${inr(R)} in their ${from} wallet${from === "driver" ? `, about ${days(R)} day pass${days(R) === 1 ? "" : "es"}` : ""}${N === 0 ? ", the moment the code is added" : ""}.`
      : `${ref} gets nothing (the reward is ₹0).`);
    example.push(X > 0
      ? `${nw} gets ${inr(X)} in their ${to} wallet ${r.referred_when === "signup" ? `right away, even if ${nw} never finishes a delivery, so Pikop pays this even when no reward follows` : N === 0 ? "the moment the code is added" : `after the ${N} deliveries`}.`
      : `${nw} gets no credit (the credit is ₹0).`);
    example.push(`Pikop gives away ${inr(R + X)} for this one referral.`);
    if (R > 0 && C > 0) example.push(`If ${ref} brings ${C + 1} people in one month${N > 0 ? ` and all finish ${N} deliveries` : ""}, only the first ${C} pay out: ${inr(R * C)} to ${ref}. The next one earns ${ref} nothing. The most ${ref} can earn from this section in a month is ${inr(R * C)}${X > 0 ? `, plus ${inr(X)} for each new person` : ""}.`);
    if (R > 0 && C === 0) example.push("The monthly limit is 0, so the referrer is never paid.");
  }
  const costNote = to === "customer" || from === "customer"
    ? "Customer-wallet credit is used against fares. Pikop then pays the driver the same amount, so every ₹1 of customer credit costs Pikop ₹1."
    : "Driver-wallet credit is used for passes, so every ₹1 of credit is ₹1 of pass fee you do not collect.";

  // ---- what this change does to the other sections ----
  const impacts: Impact[] = [];
  const name = (f: string) => FLOWS.find((x) => x.flow === f)!.tab;
  for (const o of others) {
    const oRole = roleOf(o.flow);
    const oPikop = oRole.from === "pikop";
    if (!pikop && oPikop && oRole.to === to) {
      if (!o.enabled) impacts.push({ tone: "neutral", text: `${name(o.flow)} is off, so this is the only welcome offer for a new ${to}.` });
      else if (o.referred_reward > X) impacts.push({ tone: "bad", text: `${name(o.flow)}: a new ${to} gets ${inr(o.referred_reward)} there for joining alone, but only ${inr(X)} here. People may skip the code, so ${from}s earn fewer referral rewards. Raise the credit here or lower the Pikop bonus.` });
      else impacts.push({ tone: o.referred_reward < X ? "good" : "neutral", text: `${name(o.flow)}: joining alone gives ${inr(o.referred_reward)}, ${o.referred_reward < X ? `less than the ${inr(X)} here, so using a code stays the better deal` : `the same as here`}.` });
    } else if (pikop && !oPikop && oRole.to === to) {
      if (!o.enabled) continue;
      if (X > o.referred_reward) impacts.push({ tone: "bad", text: `${name(o.flow)}: your bonus of ${inr(X)} is more than the ${inr(o.referred_reward)} a new ${to} gets there with a code. People may skip codes, which hurts that section.` });
      else impacts.push({ tone: X < o.referred_reward ? "good" : "neutral", text: `${name(o.flow)}: your bonus of ${inr(X)} is ${X < o.referred_reward ? `lower than the ${inr(o.referred_reward)} there, so codes stay attractive` : "the same as there"}.` });
    } else if (!pikop && !oPikop && oRole.to === to) {
      impacts.push({ tone: "neutral", text: `${name(o.flow)}: a new ${to} can also arrive that way. The new ${to} gets ${inr(X)} here and ${inr(o.referred_reward)} there, the referrer ${inr(R)} here and ${inr(o.referrer_reward)} there. If these differ a lot, people steer to the better one.${tripsUsed && o.trips !== N ? ` Deliveries needed: ${N} here, ${o.trips} there.` : ""}` });
    } else if (!pikop && !oPikop && oRole.from === from) {
      const total = R * C + o.referrer_reward * o.monthly_cap;
      impacts.push({ tone: total > R * C ? "bad" : "neutral", text: `${name(o.flow)}: the same ${from} can earn from both sections. Limits are counted separately for each, so one ${from} can earn up to ${inr(total)} a month in total.` });
    }
  }
  if (!pikop && !r.enabled) impacts.push({ tone: "neutral", text: `Referrals already waiting in this section are closed with no payment when the new ${to} next delivers.` });
  if (!pikop && N === 0 && R > 0) impacts.push({ tone: "bad", text: `Deliveries is 0, so the reward is paid the moment a code is added, before any real use. Fake accounts can farm this. A small number of deliveries is safer.` });
  if (pikop && N === 0 && X > 0) impacts.push({ tone: "neutral", text: `Deliveries is 0, so the bonus is paid on the person's first delivery.` });
  if (!pikop && (to === "customer" || from === "customer"))
    impacts.push({ tone: "neutral", text: `Wallet limits tab: a customer wallet covers at most ${g.wallet_max_percent}% of a fare, so a large customer credit takes several trips to use up.` });
  impacts.push({ tone: "neutral", text: `Wallet limits tab: trips shorter than ${km} km do not count in any section, so changing that changes every section.` });

  const toneCls = { good: "text-green-700", bad: "text-red-700", neutral: "text-stone-600" } as const;
  const toneTxt = { good: "Helps", bad: "Watch out", neutral: "Note" } as const;

  const fromTitle = from[0].toUpperCase() + from.slice(1);
  const toTitle = to[0].toUpperCase() + to.slice(1);
  const unusedHint = (what: string) => <span className="block text-xs text-stone-400">Not used: {what}</span>;

  const sentence = pikop ? (
    <p className="text-[17px] leading-10">
      As Pikop, if {to} <b>{nw}</b> joins on their own, with no referral code, then{" "}
      after {nw} completes
      <Num value={N} onChange={(v) => set("trips", v)} disabled={!tripsUsed} />
      deliveries, Pikop gives {nw} a welcome bonus of ₹
      <Num value={X} onChange={(v) => set("referred_reward", v)} />
      in their {to} wallet. Each person gets this once, and only people who joined after this section was switched on.
      {tripsUsed && N === 0 && <span className="block text-sm text-stone-500">0 deliveries means the bonus is paid on their first delivery.</span>}
      {!tripsUsed && <span className="block text-sm text-stone-400">The deliveries box is greyed out because the bonus is ₹0, so nothing depends on it.</span>}
    </p>
  ) : (
    <div className="space-y-2 text-[17px] leading-10">
      <p>
        As {from} <b>{ref}</b>, if I refer {to} <b>{nw}</b>, then:
      </p>
      <p>
        • After {nw} completes
        <Num value={N} onChange={(v) => set("trips", v)} disabled={!tripsUsed} />
        deliveries, I get ₹
        <Num value={R} onChange={(v) => set("referrer_reward", v)} />
        in my {from} wallet. I can earn this for up to
        <Num value={C} onChange={(v) => set("monthly_cap", v)} disabled={!capUsed} />
        referrals a month.
      </p>
      <p>
        • {nw} gets ₹
        <Num value={X} onChange={(v) => set("referred_reward", v)} />
        in their {to} wallet
        <select
          className={`mx-1 rounded-lg border-2 px-2 py-0.5 font-semibold outline-none ${whenUsed ? "border-orange-300 bg-orange-50" : "border-stone-200 bg-stone-100 text-stone-400"}`}
          value={r.referred_when} disabled={!whenUsed}
          onChange={(e) => set("referred_when", e.target.value as Rule["referred_when"])}
        >
          <option value="signup">right away, when they add my code</option>
          <option value="trips">{nowOrAfter ? "when they add my code" : `only after those ${N} deliveries`}</option>
        </select>
        .
      </p>
      <p className="text-sm leading-6 text-stone-500">
        0 deliveries means no deliveries are needed: rewards are paid the moment the code is added.
        {!tripsUsed && " The deliveries box is greyed out because no reward here depends on it."}
        {!capUsed && " The monthly limit is greyed out because the referrer reward is ₹0."}
      </p>
    </div>
  );

  const formView = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {!pikop && (
          <label className="label">
            Reward for the one who referred (₹)
            <Num inline={false} value={R} onChange={(v) => set("referrer_reward", v)} />
            <span className="text-xs font-normal text-stone-500">Goes to their own wallet ({from} wallet)</span>
          </label>
        )}
        <label className="label">
          {pikop ? `Welcome bonus for the new ${to} (₹)` : `Credit for the new ${to} (₹)`}
          <Num inline={false} value={X} onChange={(v) => set("referred_reward", v)} />
          <span className="text-xs font-normal text-stone-500">Goes to their {to} wallet</span>
        </label>
        <label className="label">
          Deliveries the new {to} must complete
          <Num inline={false} value={N} onChange={(v) => set("trips", v)} disabled={!tripsUsed} />
          <span className="text-xs font-normal text-stone-500">{tripsUsed ? "0 = no deliveries needed, paid the moment the code is added" : "Not used: nothing here depends on deliveries"}</span>
        </label>
        {!pikop && (
          <label className="label">
            The new {to} gets their credit
            <select className={`input ${whenUsed ? "" : "bg-stone-100 text-stone-400"}`} disabled={!whenUsed} value={r.referred_when} onChange={(e) => set("referred_when", e.target.value as Rule["referred_when"])}>
              <option value="signup">Right away, when they add the code</option>
              <option value="trips">After they complete the deliveries set above</option>
            </select>
            {!whenUsed && unusedHint("the credit for the new person is ₹0")}
          </label>
        )}
        {!pikop && (
          <label className="label">
            Most paid referrals per person each month
            <Num inline={false} value={C} onChange={(v) => set("monthly_cap", v)} disabled={!capUsed} />
            <span className="text-xs font-normal text-stone-500">{capUsed ? "0 = the referrer is never paid" : "Not used: the referrer reward is ₹0"}</span>
          </label>
        )}
      </div>
      <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
        <p className="mb-1 font-medium">In plain words</p>
        {!r.enabled ? (
          <p>This section is off. Nothing is paid.</p>
        ) : pikop ? (
          <p>
            Any new {to} who joins from now on, without a code, gets ₹{X} in their wallet {N === 0 ? "on their first delivery" : `after ${N} deliveries`}. Once per person.
            {r.starts_at && <> Applies to people who joined after {new Date(r.starts_at).toLocaleString("en-IN")}.</>}
          </p>
        ) : (
          <p>
            {fromTitle} refers {toTitle.toLowerCase() === "driver" ? "a driver" : "a customer"}. {r.referred_when === "signup" && X > 0 ? `The new ${to} gets ₹${X} right away. ` : X > 0 ? `The new ${to} gets ₹${X} ${N === 0 ? "when they add the code" : `after ${N} deliveries`}. ` : ""}
            {R > 0 ? `${N === 0 ? "The moment the code is added" : `After ${N} deliveries by the new ${to}`}, the referrer gets ₹${R}, up to ${C} a month.` : "The referrer gets nothing."}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="card max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={r.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            This section is switched on
          </label>
          <div className="flex overflow-hidden rounded-xl border border-stone-300 text-sm" role="group" aria-label="View">
            <button type="button" className={`px-3 py-1.5 ${view === "sentence" ? "bg-stone-900 text-white" : "bg-white"}`} onClick={() => pick("sentence")}>Sentence</button>
            <button type="button" className={`px-3 py-1.5 ${view === "form" ? "bg-stone-900 text-white" : "bg-white"}`} onClick={() => pick("form")}>Form</button>
          </div>
        </div>
        {view === "sentence" ? sentence : formView}
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
