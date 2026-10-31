"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { isConfigured, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured());

  const loadProfile = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) {
      setProfile(null);
    } else {
      const { data } = await supabase().from("profiles").select("*").eq("id", u.id).maybeSingle();
      setProfile(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isConfigured()) return;
    const sb = supabase();
    sb.auth.getUser().then(({ data }) => loadProfile(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => loadProfile(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  return { user, profile, loading };
}
