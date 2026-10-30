import Link from "next/link";
import { APP_NAME } from "@/components/Header";

export default function Home() {
  return (
    <div className="mx-auto max-w-md space-y-6 pt-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Send a parcel across Bengaluru by bike</h1>
        <p className="mt-2 text-stone-600">
          Pick up and drop on the map, see the fare upfront, and pay the driver directly in cash or UPI.
        </p>
      </div>
      <div className="grid gap-3">
        <Link href="/book" className="btn btn-primary py-4 text-base">
          Send a parcel
        </Link>
        <Link href="/driver" className="btn py-4 text-base">
          Drive with {APP_NAME}
        </Link>
      </div>
      <div className="card text-sm text-stone-600">
        <p className="font-medium text-stone-800">For drivers</p>
        <p className="mt-1">
          No commission on your trips. Keep 100% of every fare and pay a flat daily or weekly pass instead.
        </p>
      </div>
    </div>
  );
}
