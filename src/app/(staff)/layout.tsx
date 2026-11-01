import Logo from "@/components/Logo";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Logo className="text-xl text-stone-900" />
          <span className="text-sm text-stone-500">Admin</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
