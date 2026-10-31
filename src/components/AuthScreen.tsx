import { TAGLINE } from "@/lib/brand";
import Logo from "./Logo";
import PhoneLogin from "./PhoneLogin";

export default function AuthScreen({
  suffix,
  headline = TAGLINE,
  subtitle = "Pick it up, drop it off, pay the driver directly. No app wallet, no surprises.",
}: {
  suffix?: string;
  headline?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex h-full flex-col bg-white px-6 pb-8 pt-16">
      <div className="flex-1">
        <Logo className="text-4xl text-stone-900" suffix={suffix} />
        <h1 className="mt-6 text-2xl font-bold leading-tight">{headline}</h1>
        <p className="mt-2 text-stone-600">{subtitle}</p>
      </div>
      <div className="rounded-3xl bg-stone-50 p-5">
        <PhoneLogin />
      </div>
      <p className="mt-4 text-center text-xs text-stone-500">By continuing you agree to use Pikop for lawful deliveries only.</p>
    </div>
  );
}
