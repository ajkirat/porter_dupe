"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RequireUser from "@/components/RequireUser";
import StatusBadge from "@/components/StatusBadge";
import { formatKm } from "@/lib/fare";
import { supabase } from "@/lib/supabase";
import type { Job } from "@/lib/types";

function OrderList({ userId }: { userId: string }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    supabase()
      .from("jobs")
      .select("*")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setJobs(data ?? []));
  }, [userId]);

  if (!jobs) return <p className="text-stone-500">Loading…</p>;
  if (jobs.length === 0)
    return (
      <div className="card text-center">
        <p className="text-stone-600">No orders yet.</p>
        <Link href="/book" className="btn btn-primary mt-4">
          Send a parcel
        </Link>
      </div>
    );

  return (
    <ul className="space-y-3">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link href={`/orders/${j.id}`} className="card block hover:border-stone-300">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={j.status} />
              <span className="font-semibold">₹{j.fare_rupees}</span>
            </div>
            <p className="mt-2 truncate text-sm">
              <span className="text-green-700">●</span> {j.pickup_address}
            </p>
            <p className="truncate text-sm">
              <span className="text-red-600">●</span> {j.drop_address}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {new Date(j.created_at).toLocaleString("en-IN")} · {formatKm(j.distance_m)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">Your orders</h1>
      <RequireUser loginTitle="Sign in to see your orders">{({ user }) => <OrderList userId={user.id} />}</RequireUser>
    </div>
  );
}
