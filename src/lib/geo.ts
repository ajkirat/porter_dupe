// Routing via OSRM and place search via Nominatim, both on OpenStreetMap data.
// The public demo servers are fine for development and a small pilot; for real
// traffic set NEXT_PUBLIC_OSRM_URL / NEXT_PUBLIC_NOMINATIM_URL to your own instances.

export type LatLng = { lat: number; lng: number };

export type Place = LatLng & { label: string };

export type Route = {
  distanceM: number;
  durationS: number | null;
  coords: [number, number][]; // [lat, lng] pairs for drawing
  approximate: boolean; // true when OSRM was unreachable and we fell back to a straight line
};

const OSRM_URL = process.env.NEXT_PUBLIC_OSRM_URL || "https://router.project-osrm.org";
const NOMINATIM_URL = process.env.NEXT_PUBLIC_NOMINATIM_URL || "https://nominatim.openstreetmap.org";

export const BENGALURU: LatLng = { lat: 12.9716, lng: 77.5946 };
// west, north, east, south: biases search results to the city
const BENGALURU_VIEWBOX = "77.35,13.20,77.85,12.75";

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function getRoute(from: LatLng, to: LatLng): Promise<Route> {
  try {
    const url = `${OSRM_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error("no route");
    return {
      distanceM: Math.round(route.distance),
      durationS: Math.round(route.duration),
      coords: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      approximate: false,
    };
  } catch {
    // Road distance in Bengaluru is typically ~1.3x the straight line.
    const distanceM = Math.round(haversineM(from, to) * 1.3);
    return {
      distanceM,
      durationS: Math.round(distanceM / 5.5), // ~20 km/h city bike speed
      coords: [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ],
      approximate: true,
    };
  }
}

export async function searchPlaces(query: string): Promise<Place[]> {
  if (query.trim().length < 3) return [];
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "6",
    countrycodes: "in",
    viewbox: BENGALURU_VIEWBOX,
    bounded: "1",
  });
  const res = await fetch(`${NOMINATIM_URL}/search?${params}`, { headers: { "Accept-Language": "en" } });
  if (!res.ok) return [];
  const rows: { lat: string; lon: string; display_name: string }[] = await res.json();
  return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: shortLabel(r.display_name) }));
}

export async function reverseGeocode(p: LatLng): Promise<string> {
  try {
    const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lng), format: "jsonv2", zoom: "18" });
    const res = await fetch(`${NOMINATIM_URL}/reverse?${params}`, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    if (data.display_name) return shortLabel(data.display_name);
  } catch {}
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

function shortLabel(displayName: string): string {
  return displayName.split(", ").slice(0, 4).join(", ");
}

// Opens turn-by-turn directions in the phone's maps app. Free; no API key.
export function navigationUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=two-wheeler`;
}
