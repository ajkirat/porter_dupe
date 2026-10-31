"use client";

import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { isConfigured, missingConfig } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import Logo from "./Logo";
import PhoneLogin from "./PhoneLogin";
import { useSession } from "./useSession";

// For driver and admin pages: renders children only for a signed-in user, otherwise a login card.
export default function RequireUser({
  children,
  loginTitle = "Sign in",
}: {
  children: (session: { user: User; profile: Profile | null }) => ReactNode;
  loginTitle?: string;
}) {
  const { user, profile, loading } = useSession();
  if (!isConfigured()) return <SetupNotice />;
  if (loading) return <p className="p-6 text-center text-stone-500">Loading…</p>;
  if (!user)
    return (
      <div className="card mx-auto max-w-sm space-y-4">
        <Logo className="text-2xl text-stone-900" />
        <h2 className="text-lg font-semibold">{loginTitle}</h2>
        <PhoneLogin />
      </div>
    );
  return <>{children({ user, profile })}</>;
}

export function SetupNotice() {
  const missing = missingConfig();
  return (
    <div className="card mx-auto max-w-md text-sm">
      <h2 className="mb-2 font-semibold">Supabase isn&apos;t configured yet</h2>
      <p>
        The server can&apos;t see{" "}
        {missing.map((m, i) => (
          <span key={m}>
            {i > 0 && " or "}
            <code>{m}</code>
          </span>
        ))}
        . Add {missing.length > 1 ? "them" : "it"} to your hosting environment variables (available to builds and functions),
        then redeploy. See <code>docs/SETUP.md</code>.
      </p>
    </div>
  );
}
