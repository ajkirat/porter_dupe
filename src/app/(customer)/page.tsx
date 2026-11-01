"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ContactButton from "@/components/ContactButton";
import { BackIcon, BikeIcon, LocateIcon } from "@/components/icons";
import Map, { type MapFocus, type MapMarker } from "@/components/Map";
import PlaceSearch from "@/components/PlaceSearch";
import Sheet from "@/components/Sheet";
import { useUser } from "@/components/UserContext";
import { computeFare, DEFAULT_FARE, formatKm, formatMinutes, type FareSettings } from "@/lib/fare";
import { BENGALURU, getRoute, reverseGeocode, type LatLng, type Place, type Route } from "@/lib/geo";
import { isValidIndianMobile, toE164 } from "@/lib/phone";
import { errorText, supabase } from "@/lib/supabase";
import { defaultRouteLabel, PENDING_ROUTE_KEY, type SavedRoute } from "@/lib/routes";
import type { Job } from "@/lib/types";

type Field = "pickup" | "drop";
type Overlay = { kind: "search" | "pick"; field: Field } | null;

const FIELD_TITLE: Record<Field, string> = { pickup: "Pickup location", drop: "Drop location" };

export default function HomePage() {
  const router = useRouter();
  useUser(); // the shell guarantees a signed-in user; the booking RPC reads the session itself

  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [step, setStep] = useState<"where" | "details">("where");
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [routed, setRouted] = useState<{ key: string; route: Route } | null>(null);
  const [fareSettings, setFareSettings] = useState<FareSettings>(DEFAULT_FARE);
  const [pickCenter, setPickCenter] = useState<LatLng | null>(null);
  const [pickLabel, setPickLabel] = useState("");
  const [form, setForm] = useState({
    item_note: "",
    receiver_name: "",
    receiver_phone: "",
    pickup_contact_name: "",
    pickup_contact_phone: "",
  });
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [saveRoute, setSaveRoute] = useState(false);
  const [wallet, setWallet] = useState(0);
  const [walletPct, setWalletPct] = useState(50);
  const [useWallet, setUseWallet] = useState(true);
  const [sheetH, setSheetH] = useState(320);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const flyTo = (p: LatLng, zoom = 16) => setFocus((f) => ({ lat: p.lat, lng: p.lng, zoom, n: (f?.n ?? 0) + 1 }));

  // Start from where the customer is standing.
  function locate(force: boolean) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        flyTo(p);
        const label = await reverseGeocode(p);
        setPickup((prev) => (force || !prev ? { ...p, label } : prev));
      },
      () => setError("Couldn't get your location. Search for it or choose on the map."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  useEffect(() => {
    locate(false);
    // Runs once on open; locate only reads state through setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase()
      .from("settings")
      .select("base_fare, included_km, per_km, min_fare")
      .single()
      .then(({ data }) => data && setFareSettings(data));
  }, []);

  // Saved routes. If the person tapped "Book" on one in Account, start from it. Fails quietly before migration 0008.
  useEffect(() => {
    supabase()
      .from("saved_routes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as SavedRoute[]) ?? [];
        setSaved(list);
        try {
          const id = sessionStorage.getItem(PENDING_ROUTE_KEY);
          if (id) {
            sessionStorage.removeItem(PENDING_ROUTE_KEY);
            const r = list.find((x) => x.id === id);
            if (r) applyRoute(r);
          }
        } catch {}
      });
    // Runs once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wallet credit (from referrals). Both calls fail quietly if the wallet migration has not been applied yet.
  useEffect(() => {
    const sb = supabase();
    sb.rpc("my_wallet", { p_wallet: "customer" }).then(({ data }) => setWallet(typeof data === "number" ? data : 0));
    sb.from("settings").select("wallet_max_percent").single().then(({ data }) => data && setWalletPct(data.wallet_max_percent));
  }, []);

  // Road route and fare for the chosen pair of points.
  const routeKey = pickup && drop ? `${pickup.lat},${pickup.lng};${drop.lat},${drop.lng}` : "";
  const route = routed?.key === routeKey ? routed.route : null;
  useEffect(() => {
    if (pickup && drop) getRoute(pickup, drop).then((r) => setRouted({ key: routeKey, route: r }));
    // routeKey captures every pickup or drop change that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  // While choosing on the map, name the spot under the centre pin once the map settles.
  useEffect(() => {
    if (overlay?.kind !== "pick" || !pickCenter) return;
    const t = setTimeout(() => reverseGeocode(pickCenter).then(setPickLabel), 500);
    return () => clearTimeout(t);
  }, [overlay, pickCenter]);

  function setPlace(field: Field, place: Place) {
    if (field === "pickup") setPickup(place);
    else setDrop(place);
    setOverlay(null);
    setError("");
    flyTo(place);
  }

  // Fill pickup, drop and the usual parcel details from a saved route.
  function applyRoute(r: SavedRoute) {
    setPickup({ lat: r.pickup_lat, lng: r.pickup_lng, label: r.pickup_address });
    setDrop({ lat: r.drop_lat, lng: r.drop_lng, label: r.drop_address });
    setForm((f) => ({
      ...f,
      item_note: r.item_note ?? f.item_note,
      receiver_name: r.receiver_name ?? f.receiver_name,
      receiver_phone: r.receiver_phone ?? f.receiver_phone,
      pickup_contact_name: r.pickup_contact_name ?? f.pickup_contact_name,
      pickup_contact_phone: r.pickup_contact_phone ?? f.pickup_contact_phone,
    }));
    setError("");
    flyTo({ lat: r.pickup_lat, lng: r.pickup_lng });
  }

  function startPick(field: Field) {
    const start = (field === "pickup" ? pickup : drop) ?? pickup ?? BENGALURU;
    setPickCenter(null);
    setPickLabel("");
    flyTo(start);
    setOverlay({ kind: "pick", field });
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
      p_receiver_name: form.receiver_name.trim(),
      p_receiver_phone: toE164(form.receiver_phone),
      p_distance_m: route.distanceM,
      p_duration_s: route.durationS,
      p_item_note: form.item_note.trim() || null,
      p_pickup_contact_name: form.pickup_contact_name.trim() || null,
      p_pickup_contact_phone: form.pickup_contact_phone ? toE164(form.pickup_contact_phone) : null,
      ...(discount > 0 ? { p_use_wallet: true } : {}),
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    if (saveRoute) {
      // A failure here must not get in the way of the booking that just went through.
      await supabase().from("saved_routes").insert({
        label: defaultRouteLabel(pickup.label, drop.label),
        pickup_address: pickup.label,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_address: drop.label,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
        receiver_name: form.receiver_name.trim() || null,
        receiver_phone: form.receiver_phone.trim() || null,
        pickup_contact_name: form.pickup_contact_name.trim() || null,
        pickup_contact_phone: form.pickup_contact_phone.trim() || null,
        item_note: form.item_note.trim() || null,
      });
    }
    router.push(`/orders/${(data as Job).id}`);
  }

  const picking = overlay?.kind === "pick";
  const markers: MapMarker[] = [];
  if (!picking) {
    if (pickup) markers.push({ pos: pickup, label: "Pickup", kind: "pickup" });
    if (drop) markers.push({ pos: drop, label: "Drop", kind: "drop" });
  }
  const fare = route ? computeFare(route.distanceM, fareSettings) : null;
  // Same rule as the server: credit covers at most walletPct% of the fare.
  const discount = fare !== null && useWallet ? Math.max(0, Math.min(wallet, Math.floor((fare * walletPct) / 100))) : 0;
  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });
  const detailsValid = form.receiver_name.trim().length > 0 && isValidIndianMobile(form.receiver_phone);

  return (
    <div className="absolute inset-0">
      <Map
        markers={markers}
        route={picking ? undefined : route?.coords}
        focus={focus}
        padBottom={sheetH + 24}
        onCenterChange={picking ? setPickCenter : undefined}
        className="absolute inset-0 h-full"
      />

      {picking && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center pb-10">
          <svg viewBox="0 0 512 512" className="h-12 w-12 drop-shadow-lg" aria-hidden>
            <path
              d="M256 40c-86 0-154 66-154 150 0 108 154 282 154 282s154-174 154-282c0-84-68-150-154-150z"
              fill={overlay.field === "pickup" ? "#16a34a" : "#dc2626"}
              stroke="#fff"
              strokeWidth="24"
            />
            <circle cx="256" cy="190" r="56" fill="#fff" />
          </svg>
        </div>
      )}

      {!picking && step === "where" && (
        <button
          className="absolute right-4 top-4 z-10 rounded-full bg-white p-3 shadow-lg"
          onClick={() => locate(true)}
          aria-label="Use my location"
        >
          <LocateIcon className="h-5 w-5 text-brand" />
        </button>
      )}

      {picking ? (
        <Sheet onHeight={setSheetH}>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{FIELD_TITLE[overlay.field]}</p>
          <p className="mt-1 min-h-[2.5rem] text-base font-medium">{pickLabel || "Move the map to place the pin"}</p>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <button className="btn" onClick={() => setOverlay(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary py-3"
              disabled={!pickCenter || !pickLabel}
              onClick={() => pickCenter && setPlace(overlay.field, { ...pickCenter, label: pickLabel })}
            >
              Confirm location
            </button>
          </div>
        </Sheet>
      ) : step === "where" ? (
        <Sheet onHeight={setSheetH}>
          <h1 className="text-xl font-bold">Send a parcel</h1>
          <div className="mt-3 divide-y divide-stone-100 rounded-2xl border border-stone-200">
            <LocationRow dot="bg-green-600" hint="Pickup" value={pickup?.label} empty="Set pickup location" onClick={() => setOverlay({ kind: "search", field: "pickup" })} />
            <LocationRow dot="bg-red-600 rounded-[3px]" hint="Drop" value={drop?.label} empty="Where to deliver?" onClick={() => setOverlay({ kind: "search", field: "drop" })} />
          </div>

          {saved.length > 0 && !(pickup && drop) && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Saved routes</p>
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {saved.map((r) => (
                  <button key={r.id} type="button" className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm" onClick={() => applyRoute(r)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {route && fare !== null && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border-2 border-brand bg-orange-50 p-3">
                <BikeIcon className="h-9 w-9 text-brand" />
                <div className="flex-1">
                  <p className="font-semibold">Bike</p>
                  <p className="text-xs text-stone-600">
                    {formatKm(route.distanceM)} · about {formatMinutes(route.durationS)}
                    {route.approximate && " · estimate"}
                  </p>
                </div>
                <p className="text-2xl font-bold">₹{fare}</p>
              </div>
              <button className="btn btn-primary w-full py-3.5 text-base" onClick={() => setStep("details")}>
                Continue
              </button>
            </div>
          )}
          {!route && pickup && drop && <p className="mt-4 text-sm text-stone-500">Working out the route…</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Sheet>
      ) : (
        <Sheet className="max-h-[88%]" onHeight={setSheetH}>
          <form onSubmit={book} className="space-y-3">
            <div className="flex items-center gap-2">
              <button type="button" className="-ml-2 rounded-full p-2 hover:bg-stone-100" onClick={() => setStep("where")} aria-label="Back">
                <BackIcon />
              </button>
              <h1 className="text-xl font-bold">Parcel details</h1>
            </div>
            <p className="truncate text-xs text-stone-500">
              {pickup?.label} → {drop?.label}
            </p>
            <label className="label">
              What are you sending?
              <input className="input" placeholder="e.g. documents, small box under 10 kg" {...field("item_note")} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                Receiver name
                <input className="input" autoComplete="off" {...field("receiver_name")} />
              </label>
              <label className="label">
                Receiver phone
                <input className="input" inputMode="numeric" placeholder="10 digits" {...field("receiver_phone")} />
              </label>
            </div>
            <ContactButton onPick={(c) => setForm((f) => ({ ...f, receiver_name: c.name || f.receiver_name, receiver_phone: c.phone }))} />
            <details className="text-sm">
              <summary className="cursor-pointer py-1 text-stone-600">Someone else hands over the parcel?</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="label">
                  Their name
                  <input className="input" {...field("pickup_contact_name")} />
                </label>
                <label className="label">
                  Their phone
                  <input className="input" inputMode="numeric" {...field("pickup_contact_phone")} />
                </label>
              </div>
              <ContactButton field="pickup" onPick={(c) => setForm((f) => ({ ...f, pickup_contact_name: c.name || f.pickup_contact_name, pickup_contact_phone: c.phone }))} />
            </details>
            <p className="text-xs text-stone-500">You pay the driver directly, by cash, UPI or QR once the parcel is delivered. Pikop never handles the money.{discount > 0 && ` Your wallet credit lowers what you pay the driver to ₹${(fare ?? 0) - discount}.`}</p>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" className="h-4 w-4" checked={saveRoute} onChange={(e) => setSaveRoute(e.target.checked)} />
              Save this route for next time
            </label>
            {wallet > 0 && (
              <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-green-600 bg-green-50 p-3 text-sm">
                <span>
                  <b>Use wallet credit</b>
                  <span className="block text-xs text-stone-600">
                    You have ₹{wallet}. {useWallet ? `₹${discount} comes off this trip.` : "Tap to use it on this trip."}
                  </span>
                </span>
                <input type="checkbox" className="h-5 w-5" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn btn-primary w-full py-3.5 text-base" disabled={!detailsValid || busy}>
              {busy ? "Booking…" : `Book Bike · ₹${(fare ?? 0) - discount}`}
            </button>
          </form>
        </Sheet>
      )}

      {overlay?.kind === "search" && (
        <PlaceSearch
          title={FIELD_TITLE[overlay.field]}
          onPick={(p) => setPlace(overlay.field, p)}
          onClose={() => setOverlay(null)}
          onUseCurrent={
            overlay.field === "pickup"
              ? () => {
                  setOverlay(null);
                  locate(true);
                }
              : undefined
          }
          onChooseOnMap={() => startPick(overlay.field)}
        />
      )}
    </div>
  );
}

function LocationRow({ dot, hint, value, empty, onClick }: { dot: string; hint: string; value?: string; empty: string; onClick: () => void }) {
  return (
    <button type="button" className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={onClick}>
      <span className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-stone-500">{hint}</span>
        <span className={`block truncate text-base ${value ? "font-medium" : "text-stone-400"}`}>{value ?? empty}</span>
      </span>
    </button>
  );
}
