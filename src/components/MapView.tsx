"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { AttributionControl, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { BENGALURU, type LatLng } from "@/lib/geo";

export type MapMarker = { pos: LatLng; label: string; kind: "pickup" | "drop" | "driver" };
// `n` changes every time the map should move, even to the same spot.
export type MapFocus = LatLng & { zoom?: number; n: number };

const COLORS = { pickup: "#16a34a", drop: "#dc2626", driver: "#2563eb" };

function icon(kind: MapMarker["kind"]) {
  const size = kind === "driver" ? 18 : 22;
  const radius = kind === "drop" ? "4px" : "50%";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:${COLORS[kind]};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points, padBottom }: { points: LatLng[]; padBottom: number }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join("|") + `|${padBottom}`;
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
        paddingTopLeft: [40, 70],
        paddingBottomRight: [40, padBottom],
      });
    }
    // Refit only when the set of points (or the space the sheet covers) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

// Glides to each new position instead of jumping, so a moving driver looks like a moving driver.
function DriverMarker({ pos, label }: { pos: LatLng; label: string }) {
  const ref = useRef<L.Marker>(null);
  const shown = useRef<LatLng>(pos);
  // The Marker's own position stays fixed; the effect below moves it.
  const [initial] = useState(pos);

  useEffect(() => {
    const marker = ref.current;
    if (!marker) return;
    const start = shown.current;
    const t0 = performance.now();
    const duration = 1500;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const cur = { lat: start.lat + (pos.lat - start.lat) * k, lng: start.lng + (pos.lng - start.lng) * k };
      marker.setLatLng([cur.lat, cur.lng]);
      shown.current = cur;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pos.lat, pos.lng]);

  return (
    <Marker ref={ref} position={[initial.lat, initial.lng]} icon={icon("driver")}>
      <Tooltip>{label}</Tooltip>
    </Marker>
  );
}

function Focus({ focus }: { focus?: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView([focus.lat, focus.lng], focus.zoom ?? 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n, map]);
  return null;
}

function CenterReporter({ onCenterChange }: { onCenterChange: (c: LatLng) => void }) {
  const map = useMap();
  // Report where the map already is, since moveend won't fire if it never moves.
  useEffect(() => {
    const c = map.getCenter();
    onCenterChange({ lat: c.lat, lng: c.lng });
    // Only on mount; later moves come through moveend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

export default function MapView({
  markers = [],
  route,
  focus,
  padBottom = 40,
  onCenterChange,
  className = "h-72 rounded-xl",
}: {
  markers?: MapMarker[];
  route?: [number, number][];
  focus?: MapFocus | null;
  padBottom?: number;
  onCenterChange?: (c: LatLng) => void;
  className?: string;
}) {
  return (
    <MapContainer
      center={[BENGALURU.lat, BENGALURU.lng]}
      zoom={12}
      className={`z-0 w-full ${className}`}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url={process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"} />
      <AttributionControl position="topright" prefix={false} />
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#111827", weight: 4, opacity: 0.75 }} />}
      {markers.map((m) =>
        m.kind === "driver" ? (
          <DriverMarker key="driver" pos={m.pos} label={m.label} />
        ) : (
          <Marker key={m.kind + m.label} position={[m.pos.lat, m.pos.lng]} icon={icon(m.kind)}>
            <Tooltip>{m.label}</Tooltip>
          </Marker>
        ),
      )}
      {markers.length > 1 && <FitBounds points={markers.map((m) => m.pos)} padBottom={padBottom} />}
      <Focus focus={focus} />
      {onCenterChange && <CenterReporter onCenterChange={onCenterChange} />}
    </MapContainer>
  );
}
