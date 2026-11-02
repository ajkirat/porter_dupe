"use client";

import { useEffect, useState } from "react";
import { errorText, supabase } from "@/lib/supabase";

type Flag = { rule: string; severity: "high" | "medium" | "low"; subject_id: string; subject_name: string; detail: string; rupees: number; at: string };

const CHECKS = [
  ["Circular trips", "high", "A referral reward was paid, but half or more of the new person's deliveries were with the referrer. New referral rewards now ignore these trips."],
  ["Phone numbers in a row", "high", "Three or more people referred by one person have phone numbers within 5 of each other: likely one person making accounts."],
  ["Same-looking phone numbers", "high", "The referrer and the referred person have phone numbers within 5 of each other."],
  ["Wallet credit to one driver", "high", "One customer used wallet credit on 3 or more trips with the same driver in 30 days. Pikop pays that driver the discount, so this can be a way to move money to a friend."],
  ["Too-fast deliveries", "medium", "A driver finished 2 or more trips of 1.5 km or longer within 2 minutes of accepting."],
  ["Referral burst", "medium", "One person referred 5 or more people in 24 hours."],
  ["Large manual adjustment", "low", "A wallet was changed by hand by ₹500 or more in the last 30 days."],
  ["Frequent cancellations", "low", "A customer cancelled 5 or more bookings and at least 60% of them."],
  ["Large wallet balance", "low", "A wallet holds ₹1,000 or more."],
] as const;

// Nothing here blocks anyone. It lists patterns that look like cheating so you can look and decide.
export default function WatchlistTab({ open }: { open: (id: string) => void }) {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    supabase().rpc("admin_risk_flags").then(({ data, error }) => {
      if (error) return /does not exist|schema cache/i.test(error.message) ? setMissing(true) : setError(errorText(error));
      setFlags((data as Flag[]) ?? []);
    });
  }, []);

  if (missing) return <p className="card text-sm">The watchlist is not set up yet. Run migration <code>0018_admin_oversight.sql</code> in the Supabase SQL Editor.</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!flags) return <p className="text-stone-500">Checking…</p>;

  const tone = { high: "border-red-300 bg-red-50", medium: "border-amber-300 bg-amber-50", low: "border-stone-200 bg-white" } as const;
  return (
    <div className="space-y-4">
      {flags.length === 0 && <p className="card text-sm">Nothing looks suspicious right now. 🎉</p>}
      {flags.map((f, i) => (
        <div key={i} className={`card flex items-start justify-between gap-3 text-sm ${tone[f.severity]}`}>
          <div>
            <p className="font-semibold">{f.rule} <span className="font-normal text-stone-500">· {f.severity}</span></p>
            <p><b>{f.subject_name}</b>: {f.detail}</p>
            {f.rupees !== 0 && <p className="text-xs text-stone-500">₹{f.rupees}</p>}
          </div>
          <button className="btn shrink-0 py-1.5" onClick={() => open(f.subject_id)}>Open</button>
        </div>
      ))}
      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">What is checked</summary>
        <ul className="mt-2 space-y-1.5">
          {CHECKS.map(([rule, sev, text]) => (
            <li key={rule}><b>{rule}</b> <span className="text-stone-500">({sev})</span>: {text}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-stone-500">These are signals, not proof. Nothing is blocked automatically. Wallet entries cannot be edited, and every manual change is saved in the Audit tab.</p>
      </details>
    </div>
  );
}
