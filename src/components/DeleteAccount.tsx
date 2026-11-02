"use client";

import { useState } from "react";
import { errorText, supabase } from "@/lib/supabase";
import { useT } from "@/i18n";

// Required by Google Play and the App Store: the person can delete their account inside the app.
export default function DeleteAccount() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    const { error: e } = await supabase().rpc("delete_my_account");
    if (e) {
      setBusy(false);
      return setError(errorText(e));
    }
    await supabase().auth.signOut();
  }

  if (!open)
    return (
      <button className="w-full py-2 text-sm text-red-700 underline" onClick={() => setOpen(true)}>
        {t("Delete my account")}
      </button>
    );
  return (
    <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
      <p className="font-semibold text-red-800">{t("Delete your account?")}</p>
      <p className="text-stone-700">{t("This removes your saved routes and wallet credit and signs you out for good. Past orders stay in our records without your name. This cannot be undone.")}</p>
      <input className="input" placeholder={t("Type DELETE to confirm")} value={word} onChange={(e) => setWord(e.target.value)} />
      {error && <p className="text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={() => setOpen(false)}>
          {t("Keep my account")}
        </button>
        <button className="btn btn-danger" disabled={busy || word.trim() !== "DELETE"} onClick={go}>
          {t("Delete")}
        </button>
      </div>
    </div>
  );
}
