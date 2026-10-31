"use client";

import { useEffect, useState } from "react";
import { isValidIndianMobile, toE164 } from "@/lib/phone";
import { errorText, supabase } from "@/lib/supabase";

// Supabase phone OTP: number first, then the 6 digit code (verified as soon as it is complete).
export default function PhoneLogin() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const e164 = toE164(phone);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSent(true);
    setCode("");
    setResendIn(30);
  }

  async function verify(token: string) {
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.verifyOtp({ phone: e164, token, type: "sms" });
    setBusy(false);
    if (error) {
      setError("That code didn't work. Check it and try again.");
      setCode("");
    }
  }

  if (!sent) {
    return (
      <form onSubmit={send} className="space-y-4">
        <label className="label">
          Mobile number
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5 text-base">+91</span>
            <input
              className="input mt-0"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </div>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary w-full py-3.5 text-base" disabled={busy || !isValidIndianMobile(phone)}>
          {busy ? "Sending…" : "Get OTP"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Enter the 6 digit code sent to <b>{e164}</b>
      </p>
      <input
        className="input text-center text-3xl tracking-[0.5em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        autoFocus
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(v);
          if (v.length === 6) verify(v);
        }}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {busy && <p className="text-sm text-stone-500">Checking…</p>}
      <div className="flex justify-between text-sm">
        <button className="text-stone-600" onClick={() => setSent(false)}>
          Change number
        </button>
        <button className="text-brand disabled:text-stone-400" disabled={resendIn > 0 || busy} onClick={() => send()}>
          {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
