"use client";

import { useEffect, useState } from "react";
import { contactsSupported, pickContact, tenDigits } from "@/lib/contacts";
import { supabase } from "@/lib/supabase";

type Pick = { name: string; phone: string };

// "Choose from contacts" where the browser has a contact picker (Android Chrome). Everywhere else (iPhone, desktop)
// there is no web API for the address book, so we offer the people you sent parcels to before, as one-tap chips.
export default function ContactButton({ onPick, field = "receiver" }: { onPick: (c: Pick) => void; field?: "receiver" | "pickup" }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<Pick[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature check must wait for the browser
    setOk(contactsSupported());
    const [n, p] = field === "pickup" ? ["pickup_contact_name", "pickup_contact_phone"] : ["receiver_name", "receiver_phone"];
    supabase()
      .from("jobs")
      .select(`${n}, ${p}`)
      .not(p, "is", null)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const seen = new Set<string>();
        const out: Pick[] = [];
        for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
          const phone = tenDigits(row[p] ?? "");
          if (phone.length !== 10 || seen.has(phone)) continue;
          seen.add(phone);
          out.push({ name: row[n] ?? "", phone });
          if (out.length === 5) break;
        }
        setRecent(out);
      });
  }, [field]);

  if (ok === null) return null;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="text-left text-xs font-medium text-brand"
        onClick={async () => {
          if (!ok) return setNote("Your browser can't open the phone contacts (iPhones and computers don't allow it). Pick a recent person below, or type the number. Android Chrome has the contact picker.");
          setNote("");
          const c = await pickContact();
          if (c) onPick(c);
        }}
      >
        📇 Choose from contacts
      </button>
      {note && <p className="text-xs text-stone-500">{note}</p>}
      {recent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((c) => (
            <button key={c.phone} type="button" className="rounded-full border border-stone-300 px-2.5 py-1 text-xs" onClick={() => onPick(c)}>
              {c.name || c.phone}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
