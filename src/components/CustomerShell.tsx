"use client";

import { Suspense, type ReactNode } from "react";
import { isConfigured } from "@/lib/supabase";
import AuthScreen from "./AuthScreen";
import Logo from "./Logo";
import { SetupNotice } from "./RequireUser";
import TabBar from "./TabBar";
import { UserContext } from "./UserContext";
import { useSession } from "./useSession";

// The customer app frame: sign-in gate, scrolling content area and bottom tab bar.
export default function CustomerShell({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useSession();

  if (!isConfigured())
    return (
      <div className="p-4 pt-10">
        <SetupNotice />
      </div>
    );
  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Logo className="animate-pulse text-3xl text-stone-900" />
      </div>
    );
  if (!user) return <AuthScreen />;

  return (
    <UserContext.Provider value={{ user, profile }}>
      <div className="flex h-full flex-col">
        <main className="relative flex-1 overflow-y-auto">{children}</main>
        <Suspense fallback={<div className="h-[58px] shrink-0 border-t border-stone-200" />}>
          <TabBar />
        </Suspense>
      </div>
    </UserContext.Provider>
  );
}
