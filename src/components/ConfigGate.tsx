"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isConfigured, loadConfig } from "@/lib/supabase";
import Logo from "./Logo";

// Makes sure the Supabase settings are known before any screen renders.
export default function ConfigGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isConfigured());

  useEffect(() => {
    if (!ready) loadConfig().then(() => setReady(true));
  }, [ready]);

  if (!ready)
    return (
      <div className="flex h-dvh items-center justify-center">
        <Logo className="animate-pulse text-3xl text-stone-900" />
      </div>
    );
  return <>{children}</>;
}
