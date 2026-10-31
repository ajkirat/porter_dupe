// Sends a push alert to nearby drivers when a job needs one. Wire it to a Supabase Database Webhook on the `jobs`
// table (Insert and Update). Setup is in docs/PUSH.md.
// Secrets: FIREBASE_SERVICE_ACCOUNT (the JSON file's text), WEBHOOK_SECRET (any long random text you choose).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Job = { id: string; status: string; fare_rupees: number; pickup_address: string; distance_m: number };
type WebhookBody = { type: "INSERT" | "UPDATE"; record: Job; old_record: Job | null };

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Google needs a short-lived access token, made by signing a small JWT with the service account's private key.
async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  );
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  const out = await res.json();
  if (!out.access_token) throw new Error(`Google token error: ${JSON.stringify(out)}`);
  return out.access_token;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) return new Response("forbidden", { status: 403 });
  const body = (await req.json()) as WebhookBody;
  const job = body.record;
  // Only when a job becomes open (new, or dropped by a driver) or is offered to someone.
  const becameOpen = job.status === "requested" && (body.type === "INSERT" || body.old_record?.status !== "requested");
  const becameOffered = job.status === "assigned" && body.old_record?.status !== "assigned";
  if (!becameOpen && !becameOffered) return new Response("skipped");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: targets, error } = await sb.rpc("drivers_to_notify", { p_job: job.id });
  if (error) return new Response(error.message, { status: 500 });
  if (!targets?.length) return new Response("nobody to alert");

  const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
  const token = await accessToken(sa);
  const km = (job.distance_m / 1000).toFixed(1);
  let sent = 0;
  await Promise.all(
    (targets as { token: string }[]).map(async (t) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: `New request ₹${job.fare_rupees}`, body: `${km} km trip from ${job.pickup_address}` },
            data: { job_id: job.id },
            android: { priority: "HIGH", ttl: "60s", notification: { channel_id: "requests", sound: "default" } },
          },
        }),
      });
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 400) await sb.rpc("remove_push_token", { p_token: t.token }); // phone no longer has the app
    }),
  );
  return new Response(`sent ${sent}/${targets.length}`);
});
