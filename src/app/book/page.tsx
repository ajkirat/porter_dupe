"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Map, { type MapMarker } from "@/components/Map";
import PlaceInput from "@/components/PlaceInput";
import RequireUser from "@/components/RequireUser";
import { computeFare, DEFAULT_FARE, formatKm, formatMinutes, type FareSettings } from "@/lib/fare";
import { getRoute, reverseGeocode, type LatLng, type Place, type Route } from "@/lib/geo";
import { errorText, isConfigured, supabase } from "@/lib/supabase";
import type { Job } from "@/lib/types";

export default function BookPage() {
  const router = useRouter();
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [editing, setEditing] = useState<"pickup" | "drop">("pickup");
  const [routed, setRouted] = useState<{ key: string; route: Route } | null>(null);
  const [fareSettings, setFareSettings] = useState<FareSettings>(DEFAULT_FARE);
  const [form, setForm] = useState({
    item_note: "",
    pickup_contact_name: "",
    pickup_contact_phone: "",
    receiver_name: "",
    receiver_phone: "",
    payment_mode: "cash",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConfigured) return;
    supabase()
      .from("settings")
      .select("base_fare, included_km, per_km, min_fare")
      .single()
      .then(({ data }) => data && setFareSettings(data));
  }, []);

  // Only show a route that matches the current pickup and drop.
  const routeKey = pickup && drop ? `${pickup.lat},${pickup.lng};${drop.lat},${drop.lng}` : "";
  const route = routed?.key === routeKey ? routed.route : null;
  useEffect(() => {
    if (pickup && drop) getRoute(pickup, drop).then((r) => setRouted({ key: routeKey, route: r }));
    // routeKey captures every pickup/drop change that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  async function setPoint(which: "pickup" | "drop", p: LatLng, label?: string) {
    const place = { ...p, label: label ?? "Locating…" };
    if (which === "pickup") {
      setPickup(place);
      setEditing("drop");
    } else {
      setDrop(place);
    }
    if (!label) {
      const name = await reverseGeocode(p);
      (which === "pickup" ? setPickup : setDrop)({ ...p, label: name });
    }
  }

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setPoint("pickup", { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError("Couldn't get your location. Search or tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup || !drop || !route) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("create_job", {
      p_pickup_address: pickup.label,
      p_pickup_lat: pickup.lat,
      p_pickup_lng: pickup.lng,
      p_drop_address: drop.label,
      p_drop_lat: drop.lat,
      p_drop_lng: drop.lng,
      p_receiver_name: form.receiver_name,
      p_receiver_phone: form.receiver_phone,
      p_distance_m: route.distanceM,
      p_duration_s: route.durationS,
      p_item_note: form.item_note || null,
      p_pickup_contact_name: form.pickup_contact_name || null,
      p_pickup_contact_phone: form.pickup_contact_phone || null,
      p_payment_mode: form.payment_mode,
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    router.push(`/orders/${(data as Job).id}`);
  }

  const markers: MapMarker[] = [];
  if (pickup) markers.push({ pos: pickup, label: "Pickup", kind: "pickup" });
  if (drop) markers.push({ pos: drop, label: "Drop", kind: "drop" });
  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <RequireUser loginTitle="Sign in to book a delivery">
      {() => (
        <div className="grid gap-6 md:grid-cols-[1fr_380px]">
          <div className="space-y-2">
            <Map markers={markers} route={route?.coords} onClick={(p) => setPoint(editing, p)} className="h-72 md:h-[540px]" />
            <p className="text-xs text-stone-500">
              Tapping the map sets the <b>{editing}</b> point.
            </p>
          </div>

          <form onSubmit={book} className="card space-y-4">
            <h1 className="text-xl font-semibold">Send a parcel</h1>
            <PlaceInput
              label="Pickup"
              value={pickup}
              active={editing === "pickup"}
              onFocus={() => setEditing("pickup")}
              onPick={(p) => setPoint("pickup", p, p.label)}
            />
            <button type="button" className="text-sm text-brand" onClick={useMyLocation}>
              Use my current location
            </button>
            <PlaceInput
              label="Drop"
              value={drop}
              active={editing === "drop"}
              onFocus={() => setEditing("drop")}
              onPick={(p) => setPoint("drop", p, p.label)}
            />

            {route && (
              <div className="rounded-xl bg-orange-50 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-stone-600">
                    Bike · {formatKm(route.distanceM)} · {formatMinutes(route.durationS)}
                  </span>
                  <span className="text-2xl font-bold">₹{computeFare(route.distanceM, fareSettings)}</span>
                </div>
                {route.approximate && (
                  <p className="mt-1 text-xs text-stone-500">Approximate distance; the routing service didn&apos;t respond.</p>
                )}
              </div>
            )}

            <label className="label">
              What are you sending?
              <input className="input" placeholder="e.g. documents, small box under 10 kg" {...field("item_note")} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                Receiver name
                <input className="input" required {...field("receiver_name")} />
              </label>
              <label className="label">
                Receiver phone
                <input className="input" inputMode="tel" required {...field("receiver_phone")} />
              </label>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-stone-600">Someone else hands over the parcel?</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="label">
                  Pickup contact
                  <input className="input" {...field("pickup_contact_name")} />
                </label>
                <label className="label">
                  Their phone
                  <input className="input" inputMode="tel" {...field("pickup_contact_phone")} />
                </label>
              </div>
            </details>
            <label className="label">
              Pay the driver by
              <select className="input" {...field("payment_mode")}>
                <option value="cash">Cash</option>
                <option value="upi_to_driver">UPI to the driver</option>
              </select>
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn btn-primary w-full py-3 text-base" disabled={!route || busy}>
              {busy ? "Booking…" : route ? `Book for ₹${computeFare(route.distanceM, fareSettings)}` : "Choose pickup and drop"}
            </button>
          </form>
        </div>
      )}
    </RequireUser>
  );
}
