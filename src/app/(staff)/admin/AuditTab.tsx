"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type A = { id: number; at: string; actor: string | null; action: string; subject: string | null; detail: Record<string, unknown> };

// Every manual change by an admin, and system changes to rules and settings. It cannot be edited or deleted.
export default function AuditTab({ open }: { open: (id: string) => void }) {
  const [rows, setRows] = useState<A[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.from("admin_audit").select("*").order("at", { ascending: false }).limit(300).then(async ({ data, error }) => {
      if (error) return setMissing(true);
      const list = (data as A[]) ?? [];
      setRows(list);
      const ids = [...new Set(list.flatMap((r) => [r.actor, r.subject]).filter(Boolean) as string[])];
      if (ids.length) {
        const { data: ps } = await sb.from("profiles").select("id, full_name, phone").in("id", ids);
        setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.full_name || p.phone || p.id.slice(0, 8)])));
      }
    });
  }, []);

  if (missing) return <p className="card text-sm">The audit log is not set up yet. Run migration <code>0018_admin_oversight.sql</code> in the Supabase SQL Editor.</p>;
  if (!rows) return <p className="text-stone-500">Loading…</p>;
  const nm = (x: string | null) => (x ? names[x] ?? x.slice(0, 8) : "the system");
  const short = (a: A) => {
    const d = a.detail as Record<string, unknown>;
    if (a.action === "rule_changed" || a.action === "settings_changed") {
      const b = (d.before ?? {}) as Record<string, unknown>, af = (d.after ?? {}) as Record<string, unknown>;
      const ch = Object.keys(af).filter((k) => k !== "updated_at" && JSON.stringify(af[k]) !== JSON.stringify(b[k]));
      return (a.action === "rule_changed" ? `${String(af.flow)}: ` : "") + (ch.map((k) => `${k} ${JSON.stringify(b[k])} → ${JSON.stringify(af[k])}`).join(", ") || "no visible change");
    }
    return JSON.stringify(d);
  };
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="card text-sm text-stone-500">Nothing recorded yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="card p-3 text-sm">
          <p><b>{r.action.replace(/_/g, " ")}</b> by {nm(r.actor)}{r.subject && <> on <button className="underline" onClick={() => open(r.subject!)}>{nm(r.subject)}</button></>}</p>
          <p className="text-xs text-stone-500">{new Date(r.at).toLocaleString("en-IN")} · {short(r)}</p>
        </div>
      ))}
    </div>
  );
}
