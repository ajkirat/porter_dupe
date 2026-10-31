// Mirrors public.compute_fare in supabase/migrations/0001_init.sql.
// The server is the source of truth; this is only for showing an estimate before booking.

export type FareSettings = {
  base_fare: number;
  included_km: number;
  per_km: number;
  min_fare: number;
};

export const DEFAULT_FARE: FareSettings = { base_fare: 40, included_km: 2, per_km: 10, min_fare: 40 };

export function computeFare(distanceM: number, s: FareSettings = DEFAULT_FARE): number {
  const extraKm = Math.max(0, distanceM / 1000 - s.included_km);
  return Math.max(s.min_fare, s.base_fare + Math.ceil(extraKm * s.per_km));
}

export function formatKm(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export function formatMinutes(durationS: number | null | undefined): string {
  if (!durationS) return "";
  return `${Math.max(1, Math.round(durationS / 60))} min`;
}
