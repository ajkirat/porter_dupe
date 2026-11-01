"use client";

import { useEffect, useState } from "react";
import { contactsSupported, pickContact } from "@/lib/contacts";

// "From contacts" button. Renders nothing where the browser has no contact picker.
export default function ContactButton({ onPick }: { onPick: (c: { name: string; phone: string }) => void }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature check must wait for the browser
    setOk(contactsSupported());
  }, []);
  if (!ok) return null;
  return (
    <button
      type="button"
      className="mt-1 text-left text-xs font-medium text-brand"
      onClick={async () => {
        const c = await pickContact();
        if (c) onPick(c);
      }}
    >
      📇 Choose from contacts
    </button>
  );
}
