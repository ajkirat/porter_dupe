"use client";

import { useUser } from "@/components/UserContext";
import SupportCard from "@/components/SupportCard";
import DeleteAccount from "@/components/DeleteAccount";
import Link from "next/link";
import SavedRoutes from "@/components/SavedRoutes";
import WalletCard from "@/components/WalletCard";
import { APP_NAME } from "@/lib/brand";
import { supabase } from "@/lib/supabase";
import { useT } from "@/i18n";
import LanguagePicker from "@/i18n/LanguagePicker";
import SoundToggle from "@/components/SoundToggle";

const DRIVER_APP_URL = process.env.NEXT_PUBLIC_DRIVER_APP_URL;

export default function AccountPage() {
  const { t } = useT();
  const { user } = useUser();
  const phone = user.phone ? `+${user.phone.replace(/^\+/, "")}` : "";

  return (
    <div className="space-y-4 px-4 pb-6 pt-5">
      <h1 className="text-2xl font-bold">{t("Account")}</h1>
      <LanguagePicker />
      <div className="rounded-2xl border border-stone-200 p-4">
        <p className="text-xs uppercase tracking-wide text-stone-500">{t("Signed in as")}</p>
        <p className="mt-1 text-lg font-semibold">{phone}</p>
      </div>
      <SoundToggle />
      <SavedRoutes />
      <WalletCard />
      {DRIVER_APP_URL && (
        <a href={DRIVER_APP_URL} className="block rounded-2xl border border-stone-200 p-4 active:bg-stone-50">
          <p className="font-semibold">{t("Drive with {app}", { app: APP_NAME })}</p>
          <p className="text-sm text-stone-500">{t("Earn with your bike. Keep every rupee of the fare.")}</p>
        </a>
      )}
      <div className="rounded-2xl bg-orange-50 p-4 text-sm text-stone-700">
        <p className="font-semibold">{t("Add {app} to your home screen", { app: APP_NAME })}</p>
        <p className="mt-1">{t("Open the browser menu (⋮ on Android, Share on iPhone) and choose “Add to Home screen” to use it like an app.")}</p>
      </div>
      <button className="btn w-full py-3" onClick={() => supabase().auth.signOut()}>
        {t("Sign out")}
      </button>
      <SupportCard />
      <DeleteAccount />
      <p className="text-center text-xs text-stone-400">
        <Link href="/terms" className="underline">{t("Terms")}</Link> · <Link href="/privacy" className="underline">{t("Privacy policy")}</Link>
      </p>
    </div>
  );
}
