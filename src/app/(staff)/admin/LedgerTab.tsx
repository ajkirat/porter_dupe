"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Entry = { id: string; user_id: string; wallet: string; amount_rupees: number; kind: string; note: string | null; created_at: string };

// Every wallet / fee credit movement in one list, newest first. Referral rewards are applied automatically.
export default function LedgerTab() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [kind, setKind] = useState("all");

  useEffect(() => {
    const sb = supabase();
    sb.from("wallet_entries").select("*").order("created_at", { ascending: false }).limit(200).then(async ({ data }) => {
      const list = (data as Entry[]) ?? [];
      setRows(list);
      const ids = [...new Set(list.map((r) => r.user_id))];
      if (!ids.length) return;
      const { data: ps } = await sb.from("profiles").select("id,full_name,phone").in("id", ids);
      setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, `${p.full_name || "—"} ${p.phone ?? ""}`])));
    });
  }, []);

  const kinds = ["all", ...new Set(rows.map((r) => r.kind))];
  const shown = rows.filter((r) => kind === "all" || r.kind === kind);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {kinds.map((k) => (
          <button key={k} className={`btn py-1.5 ${kind === k ? "btn-primary" : ""}`} onClick={() => setKind(k)}>
            {k.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-stone-500">No entries.</p>}
      {shown.map((r) => (
        <div key={r.id} className="card flex justify-between gap-3 text-sm">
          <div>
            <p className="font-medium">{names[r.user_id] ?? r.user_id.slice(0, 8)} <span className="text-stone-500">· {r.wallet}</span></p>
            <p className="text-stone-500">{r.kind.replace(/_/g, " ")}{r.note && ` · ${r.note}`} · {new Date(r.created_at).toLocaleString("en-IN")}</p>
          </div>
          <p className={`font-semibold ${r.amount_rupees > 0 ? "text-green-700" : "text-stone-700"}`}>{r.amount_rupees > 0 ? "+" : ""}₹{r.amount_rupees}</p>
        </div>
      ))}
    </div>
  );
}
