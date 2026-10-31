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
  payment_mode: "cash" | "upi_to_driver";
  pay_at: "pickup" | "drop";
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
};

export const KYC_DOCS = [
  { key: "licence", label: "Driving licence" },
  { key: "rc", label: "Vehicle RC" },
  { key: "aadhaar", label: "Aadhaar (front)" },
  { key: "photo", label: "Your photo" },
] as const;

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
