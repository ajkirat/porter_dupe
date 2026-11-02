export type JobStatus = "requested" | "assigned" | "accepted" | "picked_up" | "delivered" | "cancelled";
export type KycStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  phone: string | null;
  full_name: string | null;
  is_admin: boolean;
};

export type Driver = {
  id: string;
  driver_code?: string;
  full_name: string;
  phone: string;
  vehicle_type: string;
  vehicle_number: string;
  licence_number: string;
  upi_id: string | null;
  kyc_docs: Record<string, string>;
  kyc_status: KycStatus;
  kyc_note: string | null;
  is_online: boolean;
  last_selfie_path: string | null;
  last_selfie_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  created_at: string;
};

export type DriverPass = {
  id: string;
  driver_id: string;
  kind: "daily" | "weekly";
  starts_at: string;
  ends_at: string;
  amount_rupees: number;
  note: string | null;
  created_at: string;
};

export type Job = {
  id: string;
  customer_id: string;
  driver_id: string | null;
  status: JobStatus;
  vehicle_type: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  drop_address: string;
  drop_lat: number;
  drop_lng: number;
  receiver_name: string;
  receiver_phone: string;
  item_note: string | null;
  distance_m: number;
  duration_s: number | null;
  fare_rupees: number;
  wallet_discount?: number;
  payment_mode: "cash" | "upi_to_driver";
  pay_at: "pickup" | "drop";
  paid_via?: "cash" | "upi" | "qr" | null;
  paid_marked_at?: string | null;
  tracking_token: string;
  cancel_reason: string | null;
  created_at: string;
  assigned_at: string | null;
  accepted_at: string | null;
  driver_arrived_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

export type Settings = {
  base_fare: number;
  included_km: number;
  per_km: number;
  min_fare: number;
  daily_pass_price: number;
  weekly_pass_price: number;
  nearby_radius_km: number;
  support_phone: string | null;
  support_hours: string | null;
  zone_name: string;
  zone_lat: number;
  zone_lng: number;
  zone_pickup_km: number;
  zone_drop_km: number;
};

export const KYC_DOCS = [
  { key: "licence", label: "Driving licence" },
  { key: "rc", label: "Vehicle RC" },
  { key: "aadhaar", label: "Aadhaar (front)" },
  { key: "photo", label: "Your photo" },
] as const;

// Documents required on top of KYC_DOCS before approval: insurance for every vehicle, a commercial permit for mini trucks.
export const EXTRA_DOCS = [
  { key: "insurance", label: "Vehicle insurance" },
  { key: "permit", label: "Commercial registration / permit" },
] as const;
export function requiredExtraDocs(vehicleType: string) {
  return EXTRA_DOCS.filter((d) => d.key === "insurance" || vehicleType !== "bike");
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  requested: "Finding a driver",
  assigned: "Offered to a driver",
  accepted: "Driver on the way to pickup",
  picked_up: "Parcel picked up",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ACTIVE_STATUSES: JobStatus[] = ["requested", "assigned", "accepted", "picked_up"];

export const PAY_AT_LABEL: Record<Job["pay_at"], string> = { pickup: "at pickup", drop: "at drop" };

export type WalletEntry = {
  id: string;
  user_id?: string;
  wallet?: "customer" | "driver";
  amount_rupees: number;
  kind: string;
  note: string | null;
  created_at: string;
};

export type ReferralItem = { who: string; status: "pending" | "rewarded" | "capped"; reward: number | null; created_at: string };

// Referral and wallet rules the admin can change. Added by migration 0007.
export type RewardSettings = {
  referral_driver_enabled: boolean;
  referral_customer_enabled: boolean;
  referral_driver_reward: number;
  referral_driver_trips: number;
  referral_customer_trips: number;
  referral_customer_reward: number;
  referral_customer_welcome: number;
  referral_max_driver: number;
  referral_max_customer: number;
  referral_min_trip_m: number;
  referral_min_fare: number;
  wallet_max_percent: number;
  wallet_expiry_days: number;
};
