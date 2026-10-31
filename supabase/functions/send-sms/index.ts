// Supabase "Send SMS" auth hook: Supabase calls this instead of Twilio, and we send the OTP through MSG91.
// Setup is in docs/SMS.md. Secrets needed: SEND_SMS_HOOK_SECRET, MSG91_AUTH_KEY, MSG91_TEMPLATE_ID.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type HookPayload = { user: { phone: string }; sms: { otp: string } };

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const body = await req.text();
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
  let data: HookPayload;
  try {
    data = new Webhook(secret).verify(body, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return fail(401, "bad signature");
  }

  const phone = data.user.phone.replace(/\D/g, ""); // e.g. 919876543210
  // Test numbers (919000000xxx) never get a real SMS.
  if (phone.startsWith("919000000")) return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", Deno.env.get("MSG91_TEMPLATE_ID") ?? "");
  url.searchParams.set("mobile", phone);
  url.searchParams.set("otp", data.sms.otp);
  const res = await fetch(url, { method: "POST", headers: { authkey: Deno.env.get("MSG91_AUTH_KEY") ?? "", "Content-Type": "application/json" } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.type === "error") return fail(502, `MSG91: ${out.message ?? res.status}`);
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});
