export type SavedRoute = {
  id: string;
  label: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_address: string;
  drop_lat: number;
  drop_lng: number;
  receiver_name: string | null;
  receiver_phone: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  item_note: string | null;
};

// Account page → booking page hand-off: the route the person tapped "Book" on.
export const PENDING_ROUTE_KEY = "pikop-use-route";

export const defaultRouteLabel = (pickup: string, drop: string) => {
  const short = (s: string) => s.split(",")[0].trim().slice(0, 24);
  return `${short(pickup)} → ${short(drop)}`;
};
