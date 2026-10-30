"use client";

import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { isConfigured } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import PhoneLogin from "./PhoneLogin";
import { useSession } from "./useSession";

// Renders children only for a signed-in user; otherwise shows the phone login.
export default function RequireUser({
  children,
  loginTitle,
}: {
  children: (session: { user: User; profile: Profile | null }) => ReactNode;
  loginTitle?: string;
}) {
  const { user, profile, loading } = useSession();
  if (!isConfigured) return <SetupNotice />;
  if (loading) return <p className="p-6 text-center text-stone-500">Loading…</p>;
  if (!user) return <PhoneLogin title={loginTitle} />;
  return <>{children({ user, profile })}</>;
}

export function SetupNotice() {
  return (
    <div className="card mx-auto max-w-md text-sm">
      <h2 className="mb-2 font-semibold">Supabase isn&apos;t configured yet</h2>
      <p>
        Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase URL and anon key, and run the SQL in{" "}
        <code>supabase/migrations</code>. The README has the full steps.
      </p>
    </div>
  );
}
