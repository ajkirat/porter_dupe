"use client";

import { useEffect, useMemo, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";

type D = { id: string; driver_code: string; full_name: string; phone: string; is_online: boolean };

// Credit the same amount to many drivers at once. Pick them from the list or paste their IDs (PK1001, PK1002 …).
export default function BulkCreditTab() {
  const [drivers, setDrivers] = useState<D[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [pasted, setPasted] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    supabase()
      .from("drivers")
      .select("id, driver_code, full_name, phone, is_online")
      .eq("kyc_status", "approved")
      .order("driver_code")
      .then(({ data, error }) => {
        if (error) return setMissing(true); // migration 0009 not applied yet
        setDrivers((data as D[]) ?? []);
      });
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (drivers ?? []).filter((d) => !q || [d.driver_code, d.full_name, d.phone].some((x) => x.toLowerCase().includes(q)));
  }, [drivers, search]);

  if (missing) return <p className="card text-sm">Driver IDs are not set up yet. Run migration <code>0009_driver_codes.sql</code> in the Supabase SQL Editor.</p>;
  if (!drivers) return <p className="text-stone-500">Loading…</p>;

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Pasting IDs adds those drivers to the selection and reports any ID that doesn't exist.
  function applyPasted() {
    const codes = pasted.toUpperCase().match(/PK\d+/g) ?? [];
    const byCode = new Map(drivers!.map((d) => [d.driver_code.toUpperCase(), d.id]));
    const unknown = codes.filter((c) => !byCode.has(c));
    setPicked((s) => {
      const n = new Set(s);
      for (const c of codes) {
        const id = byCode.get(c);
        if (id) n.add(id);
      }
      return n;
    });
    setMsg(unknown.length ? { ok: false, text: `Not found or not approved: ${[...new Set(unknown)].join(", ")}` } : codes.length ? { ok: true, text: `${codes.length} ID(s) selected.` } : { ok: false, text: "No IDs like PK1001 found in that text." });
  }

  const amt = Math.trunc(Number(amount));
  const ready = picked.size > 0 && amt > 0 && note.trim().length > 0;

  async function send() {
    const names = drivers!.filter((d) => picked.has(d.id)).map((d) => d.driver_code);
    if (!confirm(`Credit ₹${amt} to ${picked.size} driver(s) (${names.slice(0, 8).join(", ")}${names.length > 8 ? ", …" : ""}) for "${note.trim()}"?\n\nTotal ₹${amt * picked.size}.`)) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase().rpc("admin_bulk_wallet_credit", { p_drivers: [...picked], p_amount: amt, p_note: note.trim() });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: errorText(error) });
    setMsg({ ok: true, text: `Done. ₹${amt} added to ${data} driver wallet(s), ₹${amt * Number(data)} in total.` });
    setPicked(new Set());
    setPasted("");
  }

  return (
    <div className="space-y-4">
      <div className="card max-w-2xl space-y-3">
        <h2 className="font-semibold">Credit many drivers at once</h2>
        <p className="text-sm text-stone-600">This adds wallet credit inside the app. Drivers can use it on their pass. It does not send real money.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="label">
            Amount per driver (₹)
            <input className="input" type="number" min="1" max="10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="label">
            Reason (drivers see this)
            <input className="input" placeholder="Launch bonus" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <label className="label">
          Paste driver IDs (optional)
          <textarea className="input min-h-20 font-mono text-sm" placeholder="PK1001, PK1004, PK1010" value={pasted} onChange={(e) => setPasted(e.target.value)} />
        </label>
        <button type="button" className="btn" disabled={!pasted.trim()} onClick={applyPasted}>
          Select these IDs
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
        <button className="btn btn-primary w-full" disabled={!ready || busy} onClick={send}>
          {ready ? `Credit ₹${amt} to ${picked.size} driver${picked.size === 1 ? "" : "s"} (₹${amt * picked.size})` : "Pick drivers, amount and reason"}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-xs" placeholder="Search ID, name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn py-1.5" onClick={() => setPicked(new Set([...picked, ...shown.map((d) => d.id)]))}>
            Select all shown ({shown.length})
          </button>
          <button className="btn py-1.5" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
            Clear ({picked.size})
          </button>
        </div>
        {shown.length === 0 && <p className="card text-sm text-stone-500">No approved drivers match.</p>}
        {shown.map((d) => (
          <label key={d.id} className="card flex cursor-pointer items-center gap-3 p-3 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
            <span className="rounded-md bg-stone-900 px-1.5 py-0.5 font-mono text-xs text-white">{d.driver_code}</span>
            <span className="font-medium">{d.full_name}</span>
            <span className="text-stone-500">{d.phone}</span>
            {d.is_online && <span className="ml-auto text-xs text-green-700">online</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
