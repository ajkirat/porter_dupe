import Link from "next/link";
import Logo from "@/components/Logo";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/">
            <Logo className="text-xl text-stone-900" />
          </Link>
          <Link href="/" className="text-sm text-stone-500">
            Customer app
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
