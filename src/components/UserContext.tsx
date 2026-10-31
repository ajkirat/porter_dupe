"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";
import type { Profile } from "@/lib/types";

export const UserContext = createContext<{ user: User; profile: Profile | null } | null>(null);

// Only valid under CustomerShell, which renders its children only for a signed-in user.
export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside CustomerShell");
  return ctx;
}
