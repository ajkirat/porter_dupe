"use client";

import { useState } from "react";
import { errorText, supabase } from "@/lib/supabase";
import { KYC_DOCS, type Driver } from "@/lib/types";

// First-time signup, and re-submission after a rejected KYC.
export default function DriverSignup({
  userId,
  phone,
  existing,
  onDone,
}: {
  userId: string;
  phone: string;
  existing: Driver | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    full_name: existing?.full_name ?? "",
    vehicle_number: existing?.vehicle_number ?? "",
    licence_number: existing?.licence_number ?? "",
    upi_id: existing?.upi_id ?? "",
  });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const docs = existing?.kyc_docs ?? {};
  const missing = KYC_DOCS.filter((d) => !files[d.key] && !docs[d.key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) return setError(`Please add: ${missing.map((d) => d.label).join(", ")}`);
    setBusy(true);
    setError("");
    try {
      const sb = supabase();
      const uploaded: Record<string, string> = { ...docs };
      for (const [key, file] of Object.entries(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${userId}/${key}-${Date.now()}.${ext}`;
        const { error } = await sb.storage.from("kyc").upload(path, file, { upsert: true });
        if (error) throw error;
        uploaded[key] = path;
      }
      const vehicle_number = form.vehicle_number.toUpperCase().replace(/\s/g, "");
      if (existing) {
        const { error } = await sb.rpc("driver_update_profile", {
          p_full_name: form.full_name,
          p_vehicle_number: vehicle_number,
          p_licence_number: form.licence_number,
          p_upi_id: form.upi_id || null,
          p_kyc_docs: uploaded,
        });
        if (error) throw error;
      } else {
        const { error } = await sb.from("drivers").insert({
          id: userId,
          phone,
          full_name: form.full_name,
          vehicle_number,
          licence_number: form.licence_number,
          upi_id: form.upi_id || null,
          kyc_docs: uploaded,
        });
        if (error) throw error;
      }
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{existing ? "Update your documents" : "Drive with us"}</h1>
        <p className="mt-1 text-sm text-stone-600">
          Keep every rupee of your fares. You pay only a flat daily or weekly pass once you&apos;re approved.
        </p>
      </div>
      <label className="label">
        Full name (as on licence)
        <input className="input" required {...field("full_name")} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          Bike number
          <input className="input uppercase" placeholder="KA01AB1234" required {...field("vehicle_number")} />
        </label>
        <label className="label">
          Licence number
          <input className="input" required {...field("licence_number")} />
        </label>
      </div>
      <label className="label">
        Your UPI ID (customers pay you here)
        <input className="input" placeholder="name@okaxis" {...field("upi_id")} />
      </label>
      <fieldset className="space-y-2">
        <legend className="label mb-1">Documents</legend>
        {KYC_DOCS.map((d) => (
          <label key={d.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 text-sm">
            <span className="min-w-0 truncate">
              {d.label}
              {files[d.key] && <span className="ml-2 text-xs text-stone-500">{files[d.key].name}</span>}
            </span>
            <span className={`btn shrink-0 py-1.5 ${files[d.key] || docs[d.key] ? "text-green-700" : ""}`}>
              {files[d.key] || docs[d.key] ? "✓ Change" : "Add photo"}
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              capture={d.key === "photo" ? "user" : "environment"}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFiles({ ...files, [d.key]: f });
              }}
            />
          </label>
        ))}
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn btn-primary w-full py-3" disabled={busy}>
        {busy ? "Uploading…" : "Submit for approval"}
      </button>
    </form>
  );
}
