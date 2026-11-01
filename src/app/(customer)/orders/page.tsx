"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PackageIcon } from "@/components/icons";
import StatusBadge from "@/components/StatusBadge";
import { useUser } from "@/components/UserContext";
import { formatKm } from "@/lib/fare";
import { supabase } from "@/lib/supabase";
import type { Job } from "@/lib/types";

export default function OrdersPage() {
  const { user } = useUser();
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    supabase()
      .from("jobs")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setJobs(data ?? []));
  }, [user.id]);

  return (
    <div className="px-4 pb-6 pt-5">
      <h1 className="mb-4 text-2xl font-bold">Your orders</h1>
      {!jobs && <p className="text-stone-500">Loading…</p>}
      {jobs?.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center">
          <PackageIcon className="h-14 w-14 text-stone-300" />
          <p className="mt-3 font-medium">No orders yet</p>
          <p className="text-sm text-stone-500">Your deliveries will show up here.</p>
          <Link href="/" className="btn btn-primary mt-5">
            Send a parcel
          </Link>
        </div>
      )}
      <ul className="space-y-3">
        {jobs?.map((j) => (
          <li key={j.id}>
            <Link href={`/orders/${j.id}`} className="block rounded-2xl border border-stone-200 p-4 active:bg-stone-50">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={j.status} />
                <span className="font-bold">₹{j.fare_rupees - (j.wallet_discount ?? 0)}</span>
              </div>
              <p className="mt-3 truncate text-sm">
                <span className="mr-2 text-green-600">●</span>
                {j.pickup_address}
              </p>
              <p className="truncate text-sm">
                <span className="mr-2 text-red-600">■</span>
                {j.drop_address}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                {new Date(j.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {formatKm(j.distance_m)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
