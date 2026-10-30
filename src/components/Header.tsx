"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isConfigured, supabase } from "@/lib/supabase";
import { useSession } from "./useSession";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "BikeDrop";

export default function Header() {
  const { user, profile } = useSession();
  const path = usePathname();
  const links = [
    { href: "/book", label: "Send" },
    { href: "/orders", label: "Orders" },
    { href: "/driver", label: "Drive" },
    ...(profile?.is_admin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand">
          {APP_NAME}
        </Link>
        <nav className="flex flex-1 gap-3 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={path.startsWith(l.href) ? "font-semibold text-stone-900" : "text-stone-500 hover:text-stone-900"}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {isConfigured && user && (
          <button className="text-sm text-stone-500 hover:text-stone-900" onClick={() => supabase().auth.signOut()}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
