"use client";

import { useCallback, useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";

type Row = {
  id: string; code: string | null; name: string | null; phone: string | null; joined: string; last_seen: string | null;
  wallet_balance: number; wallet_given: number; wallet_spent: number; trips_done: number; trips_cancelled: number;
  referrals_made: number; referrals_paid: number; pass_ends: string | null; kyc: string | null;
};
type Detail = {
  profile: { id: string; phone: string | null; full_name: string | null; created_at: string; referral_code: string | null } | null;
  driver: { id: string; driver_code: string; full_name: string; vehicle_type: string; vehicle_number: string; kyc_status: string; upi_id: string | null; last_seen_at: string | null } | null;
  wallet: { id: string; wallet: string; amount_rupees: number; remaining_rupees: number; expires_at: string | null; kind: string; note: string | null; created_at: string }[];
  passes: { id: string; kind: string; starts_at: string; ends_at: string; amount_rupees: number; note: string | null; created_at: string }[];
  jobs: { id: string; status: string; created_at: string; delivered_at: string | null; distance_m: number; fare_rupees: number; wallet_discount: number; paid_via: string | null; customer_id: string; driver_id: string | null; pickup_address: string; drop_address: string }[];
  referred_by: { referrer_id: string; status: string; flow: string; created_at: string } | null;
  referred: { referred_id: string; status: string; flow: string; created_at: string }[];
  audit: { id: number; at: string; actor: string | null; action: string; detail: Record<string, unknown> }[];
};
type Flag = { rule: string; severity: string; subject_id: string; subject_name: string; detail: string; rupees: number; at: string };

const KIND: Record<string, string> = {
  referral_welcome: "Welcome credit", referral_reward: "Referral reward", pikop_welcome: "Pikop welcome bonus", ride_discount: "Used on a trip",
  ride_refund: "Trip refund", ride_compensation: "Paid to driver for a discount", pass_payment: "Used on a pass", admin_adjust: "Admin adjustment",
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function PeopleTab({ focus, clearFocus }: { focus: { id: string; kind: "driver" | "customer" } | null; clearFocus: () => void }) {
  const [kind, setKind] = useState<"driver" | "customer">(focus?.kind ?? "driver");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(focus?.id ?? null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    supabase().rpc("admin_people", { p_kind: kind }).then(({ data, error }) => {
      if (error) return /does not exist|schema cache/i.test(error.message) ? setMissing(true) : setError(errorText(error));
      setRows((data as Row[]) ?? []);
    });
  }, [kind]);

  if (missing) return <p className="card text-sm">People view is not set up yet. Run migration <code>0018_admin_oversight.sql</code> in the Supabase SQL Editor.</p>;
  if (open) return <PersonView id={open} onBack={() => { setOpen(null); clearFocus(); }} onOpen={setOpen} />;

  const shown = rows.filter((r) => !q || [r.name, r.phone, r.code].some((x) => (x ?? "").toLowerCase().includes(q.toLowerCase())));
  const owed = rows.reduce((a, r) => a + r.wallet_balance, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["driver", "customer"] as const).map((k) => (
          <button key={k} className={`btn py-1.5 ${kind === k ? "btn-primary" : ""}`} onClick={() => { setRows([]); setKind(k); }}>
            {k === "driver" ? "Drivers" : "Customers"}
          </button>
        ))}
        <input className="input max-w-xs py-1.5" placeholder="Search name, phone or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-sm text-stone-500">{shown.length} people · wallets hold ₹{owed} in total</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {shown.map((r) => (
        <button key={r.id} className="card block w-full p-3 text-left text-sm" onClick={() => setOpen(r.id)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {r.code && <span className="mr-2 rounded-md bg-stone-900 px-1.5 py-0.5 font-mono text-xs text-white">{r.code}</span>}
              {r.name || "No name"} <span className="font-normal text-stone-500">· {r.phone}</span>
            </p>
            <span className="font-bold">₹{r.wallet_balance}</span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {r.trips_done} delivered · {r.trips_cancelled} cancelled · {r.referrals_made} referred ({r.referrals_paid} paid) · wallet given ₹{r.wallet_given}, used ₹{r.wallet_spent}
            {kind === "driver" && ` · pass ${r.pass_ends && new Date(r.pass_ends) > new Date() ? "until " + when(r.pass_ends) : "not active"} · KYC ${r.kyc}`}
          </p>
        </button>
      ))}
      {shown.length === 0 && <p className="text-sm text-stone-500">No one here yet.</p>}
    </div>
  );
}

function PersonView({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const sb = supabase();
    const { data, error } = await sb.rpc("admin_person_detail", { p_id: id });
    if (error) return setMsg(errorText(error));
    const det = data as Detail;
    setD(det);
    const { data: fl } = await sb.rpc("admin_risk_flags");
    setFlags(((fl as Flag[]) ?? []).filter((f) => f.subject_id === id));
    const ids = [...new Set([...det.jobs.flatMap((j) => [j.customer_id, j.driver_id]), ...(det.referred.map((r) => r.referred_id)), det.referred_by?.referrer_id, ...det.audit.map((a) => a.actor)].filter(Boolean) as string[])];
    if (ids.length) {
      const { data: ps } = await sb.from("profiles").select("id, full_name, phone").in("id", ids);
      setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.full_name || p.phone || p.id.slice(0, 8)])));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    void load();
  }, [load]);

  async function adjust() {
    const wallet = d?.driver ? "driver" : "customer";
    const amount = Math.trunc(Number(prompt(`Add (+) or remove (−) ₹ in the ${wallet} wallet:`, "50")));
    if (!amount) return;
    const note = prompt("Reason (the person sees this and it is saved in the audit log):", "Goodwill");
    if (!note) return;
    const { error } = await supabase().rpc("admin_adjust_wallet", { p_user: id, p_wallet: wallet, p_amount: amount, p_note: note });
    setMsg(error ? errorText(error) : "Adjusted.");
    load();
  }

  if (!d) return <div><button className="btn mb-3" onClick={onBack}>← Back</button><p className="text-stone-500">{msg || "Loading…"}</p></div>;
  const nm = (x: string | null | undefined) => (x ? names[x] ?? x.slice(0, 8) : "—");
  const walletName = d.driver ? "driver" : "customer";
  const mine = d.wallet.filter((e) => e.wallet === walletName);
  const given = mine.filter((e) => e.amount_rupees > 0).reduce((a, e) => a + e.amount_rupees, 0);
  const spent = -mine.filter((e) => e.amount_rupees < 0).reduce((a, e) => a + e.amount_rupees, 0);
  const sev = { high: "bg-red-100 text-red-800", medium: "bg-amber-100 text-amber-800", low: "bg-stone-100 text-stone-700" } as Record<string, string>;
  const asDriver = d.jobs.filter((j) => j.driver_id === id), asCustomer = d.jobs.filter((j) => j.customer_id === id);

  return (
    <div className="space-y-4">
      <button className="btn" onClick={onBack}>← Back to the list</button>
      <div className="card space-y-1 text-sm">
        <p className="text-lg font-semibold">
          {d.driver?.driver_code && <span className="mr-2 rounded-md bg-stone-900 px-1.5 py-0.5 font-mono text-xs text-white">{d.driver.driver_code}</span>}
          {d.driver?.full_name || d.profile?.full_name || "No name"}
        </p>
        <p className="text-stone-600">{d.profile?.phone} · joined {when(d.profile?.created_at ?? null)}{d.profile?.referral_code && ` · referral code ${d.profile.referral_code}`}</p>
        {d.driver && <p className="text-stone-600">{d.driver.vehicle_type} {d.driver.vehicle_number} · KYC {d.driver.kyc_status} · last seen {when(d.driver.last_seen_at)}{d.driver.upi_id && ` · UPI ${d.driver.upi_id}`}</p>}
        {d.referred_by && <p className="text-stone-600">Came through a referral from <b>{nm(d.referred_by.referrer_id)}</b> ({d.referred_by.flow.replace("_", " → ")}, {d.referred_by.status})</p>}
        {msg && <p className="text-stone-600">{msg}</p>}
      </div>

      {flags.length > 0 && (
        <div className="card space-y-2 border-red-200 bg-red-50 text-sm">
          <p className="font-semibold text-red-800">Watchlist</p>
          {flags.map((f, i) => (
            <p key={i}><span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${sev[f.severity]}`}>{f.severity}</span><b>{f.rule}:</b> {f.detail}</p>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-xs text-stone-500">{walletName} wallet balance</p><p className="text-2xl font-bold">₹{given - spent}</p><button className="btn mt-2 py-1" onClick={adjust}>± Adjust</button></div>
        <div className="card"><p className="text-xs text-stone-500">Credit received</p><p className="text-2xl font-bold">₹{given}</p></div>
        <div className="card"><p className="text-xs text-stone-500">Credit used</p><p className="text-2xl font-bold">₹{spent}</p></div>
      </div>

      <Section title={`Wallet history (${d.wallet.length})`}>
        {d.wallet.map((e) => (
          <div key={e.id} className="flex justify-between gap-3 border-t border-stone-100 py-1.5 text-sm">
            <span>{KIND[e.kind] ?? e.kind} · {e.wallet}{e.note && <span className="text-stone-500"> · {e.note}</span>}<span className="block text-xs text-stone-400">{when(e.created_at)}{e.expires_at && ` · expires ${when(e.expires_at)}`}</span></span>
            <b className={e.amount_rupees > 0 ? "text-green-700" : ""}>{e.amount_rupees > 0 ? "+" : "−"}₹{Math.abs(e.amount_rupees)}</b>
          </div>
        ))}
      </Section>

      {d.driver && (
        <Section title={`Passes (${d.passes.length})`}>
          {d.passes.map((p) => (
            <p key={p.id} className="border-t border-stone-100 py-1.5 text-sm">{p.kind} · {when(p.starts_at)} to {when(p.ends_at)} · ₹{p.amount_rupees}{p.note && ` · ${p.note}`}</p>
          ))}
        </Section>
      )}

      <Section title={`Trips (${d.jobs.length})`}>
        {[...asDriver.map((j) => ({ j, role: "drove" })), ...asCustomer.map((j) => ({ j, role: "booked" }))].sort((a, b) => +new Date(b.j.created_at) - +new Date(a.j.created_at)).map(({ j, role }) => (
          <div key={j.id + role} className="border-t border-stone-100 py-1.5 text-sm">
            <p>{role === "drove" ? "Drove for" : "Booked, driver"} <b>{nm(role === "drove" ? j.customer_id : j.driver_id)}</b> · {j.status} · ₹{j.fare_rupees}{j.wallet_discount > 0 && ` (wallet −₹${j.wallet_discount})`}{j.paid_via && ` · paid by ${j.paid_via}`}</p>
            <p className="text-xs text-stone-500">{when(j.created_at)} · {(j.distance_m / 1000).toFixed(1)} km · {j.pickup_address} → {j.drop_address}</p>
          </div>
        ))}
      </Section>

      <Section title={`People referred (${d.referred.length})`}>
        {d.referred.map((r) => (
          <button key={r.referred_id} className="block w-full border-t border-stone-100 py-1.5 text-left text-sm" onClick={() => onOpen(r.referred_id)}>
            {nm(r.referred_id)} · {r.flow.replace("_", " → ")} · <b>{r.status}</b> · {when(r.created_at)}
          </button>
        ))}
      </Section>

      <Section title={`Admin and system changes (${d.audit.length})`}>
        {d.audit.map((a) => (
          <p key={a.id} className="border-t border-stone-100 py-1.5 text-sm">{when(a.at)} · <b>{a.action.replace(/_/g, " ")}</b> by {a.actor ? nm(a.actor) : "the system"} · <span className="text-stone-500">{JSON.stringify(a.detail)}</span></p>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [shut, setShut] = useState(false);
  return (
    <div className="card p-3">
      <button className="flex w-full justify-between text-left font-semibold" onClick={() => setShut(!shut)}><span>{title}</span><span className="text-stone-400">{shut ? "show" : "hide"}</span></button>
      {!shut && <div className="mt-1">{children}</div>}
    </div>
  );
}
