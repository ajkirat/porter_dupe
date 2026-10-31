"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RequireUser from "@/components/RequireUser";
import type { LatLng } from "@/lib/geo";
import { errorText, supabase } from "@/lib/supabase";
import type { Driver, DriverPass, Job } from "@/lib/types";
import ActiveJob from "./ActiveJob";
import DriverSignup from "./DriverSignup";
import JobCard from "./JobCard";

const OPERATOR_UPI = process.env.NEXT_PUBLIC_OPERATOR_UPI;
const LOCATION_PUSH_IDLE_MS = 15000;
const LOCATION_PUSH_TRIP_MS = 4000; // fast enough that customers see the bike move

function DriverHome({ userId, phone }: { userId: string; phone: string }) {
  const [driver, setDriver] = useState<Driver | null | undefined>(undefined);
  const [pass, setPass] = useState<DriverPass | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.from("drivers").select("*").eq("id", userId).maybeSingle();
    setDriver(data);
    const { data: passes } = await sb
      .from("driver_passes")
      .select("*")
      .eq("driver_id", userId)
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1);
    setPass(passes?.[0] ?? null);
  }, [userId]);

  useEffect(() => {
    // Async loader: state is only set after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (driver === undefined) return <p className="text-stone-500">Loading…</p>;
  if (!driver || editing || driver.kyc_status === "rejected") {
    return (
      <div className="space-y-4">
        {driver?.kyc_status === "rejected" && (
          <div className="card border-red-200 bg-red-50 text-sm text-red-800">
            Your documents were not approved{driver.kyc_note ? `: ${driver.kyc_note}` : "."} Please fix and resubmit.
          </div>
        )}
        <DriverSignup
          userId={userId}
          phone={phone}
          existing={driver}
          onDone={() => {
            setEditing(false);
            load();
          }}
        />
      </div>
    );
  }
  if (driver.kyc_status === "pending") {
    return (
      <div className="card space-y-3 text-center">
        <h1 className="text-xl font-semibold">Thanks, {driver.full_name.split(" ")[0]}</h1>
        <p className="text-stone-600">We&apos;re checking your documents. You&apos;ll be able to go online once approved.</p>
        <button className="btn" onClick={() => setEditing(true)}>
          Edit details
        </button>
      </div>
    );
  }
  return <ApprovedDriver driver={driver} pass={pass} reload={load} />;
}

function ApprovedDriver({ driver, pass, reload }: { driver: Driver; pass: DriverPass | null; reload: () => void }) {
  const [me, setMe] = useState<LatLng | null>(null);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [prices, setPrices] = useState({ daily_pass_price: 75, weekly_pass_price: 500 });
  const lastPush = useRef(0);
  const pushEvery = useRef(LOCATION_PUSH_IDLE_MS);

  useEffect(() => {
    supabase()
      .from("settings")
      .select("daily_pass_price, weekly_pass_price")
      .single()
      .then(({ data }) => data && setPrices(data));
  }, []);

  const refresh = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb
      .from("jobs")
      .select("*")
      .eq("driver_id", driver.id)
      .in("status", ["assigned", "accepted", "picked_up"])
      .order("created_at");
    setMyJobs(data ?? []);
    if (driver.is_online && me) {
      const { data: open } = await sb.rpc("driver_open_jobs", { p_lat: me.lat, p_lng: me.lng });
      setOpenJobs(open ?? []);
    } else {
      setOpenJobs([]);
    }
  }, [driver.id, driver.is_online, me]);

  // Track position while the page is open; push it to the server at most every 15s.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        if (Date.now() - lastPush.current > pushEvery.current) {
          lastPush.current = Date.now();
          supabase().rpc("driver_set_location", { p_lat: p.lat, p_lng: p.lng });
        }
      },
      () => setError("Location is off. Turn it on so customers can see you and you can see nearby jobs."),
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    // Async loader: state is only set after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const sb = supabase();
    const channel = sb
      .channel(`driver-${driver.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => refresh())
      .subscribe();
    const poll = setInterval(refresh, 20000);
    return () => {
      sb.removeChannel(channel);
      clearInterval(poll);
    };
  }, [driver.id, refresh]);

  async function call(fn: string, args: Record<string, unknown>) {
    setError("");
    const { error } = await supabase().rpc(fn, args);
    if (error) setError(errorText(error));
    reload();
    refresh();
  }

  const current = myJobs.find((j) => j.status === "accepted" || j.status === "picked_up");
  const onTrip = Boolean(current);
  useEffect(() => {
    pushEvery.current = onTrip ? LOCATION_PUSH_TRIP_MS : LOCATION_PUSH_IDLE_MS;
  }, [onTrip]);
  const offers = myJobs.filter((j) => j.status === "assigned");

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{driver.full_name}</p>
          <p className="text-xs text-stone-500">
            {pass
              ? `${pass.kind === "daily" ? "Daily" : "Weekly"} pass until ${new Date(pass.ends_at).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : "No active pass"}
          </p>
        </div>
        <button
          className={`btn ${driver.is_online ? "btn-primary" : ""}`}
          disabled={!pass && !driver.is_online}
          onClick={() => call("driver_set_online", { p_online: !driver.is_online })}
        >
          {driver.is_online ? "Online" : "Go online"}
        </button>
      </div>

      {!pass && (
        <div className="card bg-orange-50 text-sm">
          <p className="font-medium">Buy a pass to start taking jobs</p>
          <p className="mt-1 text-stone-600">
            Pay ₹{prices.daily_pass_price} for a day or ₹{prices.weekly_pass_price} for a week{OPERATOR_UPI ? ` to UPI ${OPERATOR_UPI}` : ""} and send the screenshot to us on
            WhatsApp. We&apos;ll switch your pass on.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {current && <ActiveJob job={current} me={me} onChange={refresh} />}

      {offers.map((job) => (
        <div key={job.id} className="space-y-2">
          <h2 className="font-semibold">New job for you</h2>
          <JobCard job={job} from={me}>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button className="btn" onClick={() => call("reject_job", { p_job: job.id })}>
                Reject
              </button>
              <button className="btn btn-primary" disabled={!!current} onClick={() => call("accept_job", { p_job: job.id })}>
                Accept
              </button>
            </div>
          </JobCard>
        </div>
      ))}

      {!current && driver.is_online && (
        <div className="space-y-3">
          <h2 className="font-semibold">Jobs near you</h2>
          {!me && <p className="text-sm text-stone-500">Waiting for your location…</p>}
          {me && openJobs.length === 0 && <p className="text-sm text-stone-500">No open jobs nearby right now. This list refreshes on its own.</p>}
          {openJobs.map((job) => (
            <JobCard key={job.id} job={job} from={me}>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button className="btn" onClick={() => call("reject_job", { p_job: job.id })}>
                  Hide
                </button>
                <button className="btn btn-primary" onClick={() => call("accept_job", { p_job: job.id })}>
                  Accept
                </button>
              </div>
            </JobCard>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DriverPage() {
  return (
    <div className="mx-auto max-w-md">
      <RequireUser loginTitle="Sign in to drive">
        {({ user }) => <DriverHome userId={user.id} phone={user.phone ? `+${user.phone.replace(/^\+/, "")}` : ""} />}
      </RequireUser>
    </div>
  );
}
