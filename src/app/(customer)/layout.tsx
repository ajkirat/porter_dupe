import CustomerShell from "@/components/CustomerShell";

// Phone-sized app frame; on a desktop browser it sits centred in the window.
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-stone-200">
      <div className="mx-auto h-dvh max-w-[480px] overflow-hidden bg-white shadow-xl">
        <CustomerShell>{children}</CustomerShell>
      </div>
    </div>
  );
}
