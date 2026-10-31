"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, ListIcon, UserIcon } from "./icons";

const TABS = [
  { href: "/", label: "Send", Icon: HomeIcon },
  { href: "/orders", label: "Orders", Icon: ListIcon },
  { href: "/account", label: "Account", Icon: UserIcon },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="flex shrink-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? "text-brand" : "text-stone-500"}`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
