"use client";

import { useEffect, useState } from "react";
import { PhoneIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase";

// Support number and hours, set by the admin in Settings. Hidden until a number is saved.
export default function SupportCard() {
  const [s, setS] = useState<{ support_phone: string | null; support_hours: string | null } | null>(null);
  useEffect(() => {
    supabase().from("settings").select("support_phone, support_hours").single().then(({ data }) => setS(data));
  }, []);
  if (!s?.support_phone) return null;
  const tel = s.support_phone.replace(/[^\d+]/g, "");
  return (
    <div className="card space-y-2 text-sm">
      <p className="font-semibold">Need help?</p>
      {s.support_hours && <p className="text-xs text-stone-500">Phone support: {s.support_hours}</p>}
      <div className="grid grid-cols-2 gap-2">
        <a className="btn gap-2" href={`tel:${tel}`}>
          <PhoneIcon className="h-4 w-4" /> Call us
        </a>
        <a className="btn" href={`https://wa.me/${tel.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
      </div>
    </div>
  );
}
