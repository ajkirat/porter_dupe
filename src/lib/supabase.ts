"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Config = { url: string; anonKey: string };

// Values baked in at build time, if the host provided them. Otherwise ConfigGate loads
// them from /api/config before anything renders.
let config: Config = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
};
let client: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return Boolean(config.url && config.anonKey);
}

// What is missing, for the setup notice.
export function missingConfig(): string[] {
  return [...(config.url ? [] : ["NEXT_PUBLIC_SUPABASE_URL"]), ...(config.anonKey ? [] : ["NEXT_PUBLIC_SUPABASE_ANON_KEY"])];
}

export async function loadConfig(): Promise<void> {
  if (isConfigured()) return;
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (res.ok) {
      const c: Config = await res.json();
      config = { url: c.url || "", anonKey: c.anonKey || "" };
      client = null;
    }
  } catch {
    // Leave unconfigured; the setup notice explains what to do.
  }
}

export function supabase(): SupabaseClient {
  if (!isConfigured()) {
    throw new Error("Supabase is not configured. Add the Supabase URL and anon key to the environment variables.");
  }
  client ??= createClient(config.url, config.anonKey);
  return client;
}

// Supabase RPC errors come back as { message }; surface that text to the user.
export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
