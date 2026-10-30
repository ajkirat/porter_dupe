"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { BENGALURU, type LatLng } from "@/lib/geo";

export type MapMarker = { pos: LatLng; label: string; kind: "pickup" | "drop" | "driver" };

const COLORS = { pickup: "#16a34a", drop: "#dc2626", driver: "#2563eb" };

function icon(kind: MapMarker["kind"]) {
  const size = kind === "driver" ? 18 : 22;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${COLORS[kind]};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40] });
    // Refit only when the set of points actually moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function ClickHandler({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function MapView({
  markers = [],
  route,
  onClick,
  className = "h-72",
}: {
  markers?: MapMarker[];
  route?: [number, number][];
  onClick?: (p: LatLng) => void;
  className?: string;
}) {
  return (
    <MapContainer
      center={[BENGALURU.lat, BENGALURU.lng]}
      zoom={12}
      className={`w-full rounded-xl z-0 ${className}`}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url={process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
      />
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#111827", weight: 4, opacity: 0.7 }} />}
      {markers.map((m) => (
        <Marker key={m.kind + m.label} position={[m.pos.lat, m.pos.lng]} icon={icon(m.kind)}>
          <Tooltip>{m.label}</Tooltip>
        </Marker>
      ))}
      <FitBounds points={markers.map((m) => m.pos)} />
      {onClick && <ClickHandler onClick={onClick} />}
    </MapContainer>
  );
}
