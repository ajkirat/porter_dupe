"use client";

import { useState } from "react";
import { errorText, supabase } from "@/lib/supabase";

// Supabase phone OTP. Numbers are assumed Indian unless they start with "+".
export default function PhoneLogin({ title = "Sign in with your phone" }: { title?: string }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const e164 = phone.trim().startsWith("+") ? phone.replace(/\s/g, "") : `+91${phone.replace(/\D/g, "").slice(-10)}`;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) setError(errorText(error));
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.verifyOtp({ phone: e164, token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) setError(errorText(error));
  }

  return (
    <div className="card mx-auto max-w-sm">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {!sent ? (
        <form onSubmit={send} className="space-y-3">
          <label className="label">
            Mobile number
            <input
              className="input"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-stone-600">We sent a code to {e164}.</p>
          <label className="label">
            OTP
            <input
              className="input tracking-widest"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Checking…" : "Verify"}
          </button>
          <button type="button" className="btn w-full" onClick={() => setSent(false)}>
            Change number
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
