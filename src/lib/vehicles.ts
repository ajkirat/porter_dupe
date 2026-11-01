// Vehicle choices, like Porter. Sizes are stored in cm and shown in feet (how people think of them) with cm beside.
export type VehicleType = {
  code: string;
  name: string;
  description: string;
  max_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  base_fare: number;
  included_km: number;
  per_km: number;
  min_fare: number;
  sort_order: number;
  active: boolean;
};

const ft = (cm: number) => String(Math.round((cm / 30.48) * 10) / 10);

export const sizeFeet = (v: Pick<VehicleType, "length_cm" | "width_cm" | "height_cm">) =>
  `${ft(v.length_cm)} × ${ft(v.width_cm)} × ${ft(v.height_cm)} ft`;
export const sizeCm = (v: Pick<VehicleType, "length_cm" | "width_cm" | "height_cm">) =>
  `${v.length_cm} × ${v.width_cm} × ${v.height_cm} cm`;
export const capacity = (v: Pick<VehicleType, "max_kg">) => `Up to ${v.max_kg} kg`;

// Used until the vehicle list loads, or before migration 0013 is applied.
export const BIKE_ONLY: VehicleType[] = [
  { code: "bike", name: "Bike", description: "Documents, small boxes, food, gifts", max_kg: 20, length_cm: 40, width_cm: 30, height_cm: 30, base_fare: 40, included_km: 2, per_km: 10, min_fare: 40, sort_order: 1, active: true },
];
