"use client";

import Link from "next/link";
import { useUser } from "@/components/UserContext";
import WalletCard from "@/components/WalletCard";
import { APP_NAME } from "@/lib/brand";
import { supabase } from "@/lib/supabase";

const DRIVER_APP_URL = process.env.NEXT_PUBLIC_DRIVER_APP_URL;

export default function AccountPage() {
  const { user, profile } = useUser();
  const phone = user.phone ? `+${user.phone.replace(/^\+/, "")}` : "";

  return (
    <div className="space-y-4 px-4 pb-6 pt-5">
      <h1 className="text-2xl font-bold">Account</h1>
      <div className="rounded-2xl border border-stone-200 p-4">
        <p className="text-xs uppercase tracking-wide text-stone-500">Signed in as</p>
        <p className="mt-1 text-lg font-semibold">{phone}</p>
      </div>
      <WalletCard />
      {DRIVER_APP_URL && (
        <a href={DRIVER_APP_URL} className="block rounded-2xl border border-stone-200 p-4 active:bg-stone-50">
          <p className="font-semibold">Drive with {APP_NAME}</p>
          <p className="text-sm text-stone-500">Earn with your bike. Keep every rupee of the fare. Opens the {APP_NAME} Driver app.</p>
        </a>
      )}
      {profile?.is_admin && (
        <Link href="/admin" className="block rounded-2xl border border-stone-200 p-4 active:bg-stone-50">
          <p className="font-semibold">Admin panel</p>
        </Link>
      )}
      <div className="rounded-2xl bg-orange-50 p-4 text-sm text-stone-700">
        <p className="font-semibold">Add {APP_NAME} to your home screen</p>
        <p className="mt-1">Open the browser menu (⋮ on Android, Share on iPhone) and choose “Add to Home screen” to use it like an app.</p>
      </div>
      <button className="btn w-full py-3" onClick={() => supabase().auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
