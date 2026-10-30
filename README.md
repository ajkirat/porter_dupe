# BikeDrop: bike parcel delivery for Bengaluru

A Porter-style MVP for moving parcels across one city by bike. Customers book on a map and pay the driver directly (cash or the driver's UPI). Drivers keep the whole fare and pay a flat daily or weekly pass instead of commission. The platform never touches ride money.

One Next.js app serves three roles:

| Route | Who | What |
|---|---|---|
| `/book` | Customer | Pick pickup and drop (search or tap the map), see a distance-based fare, book |
| `/orders`, `/orders/[id]` | Customer | Live status, pickup and drop OTPs, driver details, share tracking link, cancel |
| `/track/[token]` | Receiver | Public tracking page, no sign-in |
| `/driver` | Driver | Sign up with KYC documents, go online, accept or reject jobs, navigate, confirm pickup and drop with OTPs |
| `/admin` | Operator | Approve or reject KYC, record pass payments, see all trips, manually offer a job to a driver, edit fares and pass prices |

It is a PWA, so drivers and customers can "Add to home screen" on Android without a Play Store listing.

## Stack

- **Next.js 16** (App Router, client-rendered pages) + Tailwind 4
- **Supabase**: phone OTP auth, Postgres with row level security, Realtime for job updates, Storage for KYC documents
- **OpenStreetMap**: Leaflet + OSM tiles, OSRM for road distance, Nominatim for place search. No Google Maps bill. If OSRM is unreachable the app falls back to 1.3× straight-line distance.

All state changes (booking, accepting, OTP checks, dispatch, passes) go through Postgres functions in `supabase/migrations/0001_init.sql`, so the rules hold no matter what the client sends: the fare is computed on the server, drivers cannot read OTPs or approve themselves, and only approved drivers with a running pass can see or take jobs.

## How a trip works

1. Customer books. The server computes the fare and generates a 4-digit pickup OTP and drop OTP that only the customer (and admins) can see.
2. Online drivers with an active pass see open jobs within 6 km (configurable) and the first to accept gets it. As a fallback, an admin can offer a job to a specific driver, who accepts or rejects.
3. At pickup the sender reads the pickup OTP to the driver, who enters it to mark the parcel picked up.
4. At drop the receiver gives the drop OTP (the customer shares it with them along with the tracking link). The driver enters it, the trip is delivered, and the customer pays the driver.

## Driver passes

Drivers pay the operator outside the app (UPI to `NEXT_PUBLIC_OPERATOR_UPI`, then a WhatsApp screenshot). The admin presses "+ Day pass" or "+ Week pass" on the driver, which records the payment and extends access. New passes stack on top of any pass still running. Prices default to ₹75/day and ₹500/week and are editable in Admin → Settings.

## Fares

`max(min_fare, base_fare + ceil((km − included_km) × per_km))`. Defaults: ₹40 base including 2 km, ₹10/km after, ₹40 minimum (so 5 km ≈ ₹70). Edit in Admin → Settings. The same formula lives in `src/lib/fare.ts` (estimate shown before booking) and `public.compute_fare` (what is actually charged).

## Setup

1. **Create a Supabase project** (free tier is enough to start).
2. **Run the SQL**: open the SQL editor and run `supabase/migrations/0001_init.sql`, then `0002_storage.sql`. (Or use the Supabase CLI: `supabase link` then `supabase db push`.)
3. **Turn on phone auth**: Authentication → Providers → Phone. Pick an SMS provider (Twilio, MessageBird, Vonage or Textlocal). For development you can skip the provider and add test numbers with fixed OTPs under "Phone numbers for testing".
4. **Configure the app**:
   ```bash
   cp .env.example .env.local   # add your Supabase URL and anon key
   npm install
   npm run dev
   ```
5. **Make yourself admin**: sign in once at `/admin`, then in the SQL editor run
   ```sql
   update profiles set is_admin = true where phone = '91XXXXXXXXXX';
   ```

Deploy anywhere that runs Next.js (Vercel's free tier works); set the same environment variables there.

### Before real traffic

The public OSRM, Nominatim and OSM tile servers are for light use only. Once you have real trips, self-host OSRM and Nominatim with the Karnataka extract (or use a paid OSM provider) and point `NEXT_PUBLIC_OSRM_URL`, `NEXT_PUBLIC_NOMINATIM_URL` and `NEXT_PUBLIC_TILE_URL` at them.

## Tests

```bash
npm test          # fare formula unit tests
npm run test:db   # full booking flow against the SQL schema on a local Postgres
npm run lint && npm run typecheck
```

`test:db` creates a throwaway database, loads a small stand-in for Supabase's `auth` and `storage` schemas, applies the migrations and walks a trip end to end: RLS checks, KYC approval, passes, manual offer and reject, accept race, wrong and right OTPs, and the public tracking page. It needs `createdb`/`psql` access to a local Postgres (for example `sudo -u postgres npm run test:db`).

## Deliberately left out (per the brief)

Ratings, surge pricing, in-app payments, automatic dispatch, push notifications and native apps. Natural next steps: FCM push for new jobs, a WhatsApp booking link that pre-fills `/book`, and driver earnings history.

## Open questions

These were assumed and are easy to change:

- **Area**: all of Bengaluru. Narrow it by tightening the search viewbox in `src/lib/geo.ts` and adding a service-area check in `create_job`.
- **Vehicles**: bike only. `vehicle_type` already exists on drivers and jobs for adding scooters with boxes or 3-wheelers.
- **KYC documents**: driving licence, RC, Aadhaar front and a photo (`KYC_DOCS` in `src/lib/types.ts`).
