# Real SMS login with MSG91

Supabase sends login codes through a small function (`supabase/functions/send-sms`) that calls MSG91. Test numbers `919000000xxx` never get a real SMS.

1. **DLT** (India's SMS rule): in MSG91, register as a business or individual, a sender ID (6 letters, e.g. `PIKOPS`), and an OTP template such as `Your Pikop login code is ##var##. Do not share it.` Wait for approval.
2. In MSG91 **OTP** section, create a template linked to the approved DLT template. Copy its **Template ID**. Copy your **Auth key** from your profile.
3. Supabase dashboard → **Edge Functions** → **Deploy a new function** → name it `send-sms` and paste `supabase/functions/send-sms/index.ts`. Turn **off** "Verify JWT".
4. Supabase → **Authentication** → **Hooks** → **Send SMS** → choose **HTTPS** or the edge function, pick `send-sms`, and click **Generate secret**. Copy the secret.
5. Edge Functions → **Secrets**: add `SEND_SMS_HOOK_SECRET` (the secret from step 4), `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`.
6. Authentication → Sign In / Providers → Phone: keep it enabled. Test with a real number.
