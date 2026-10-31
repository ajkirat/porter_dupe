# Push alerts for new requests

Drivers' phones get an alert even when the app is closed. Pieces: a Firebase project (the Android app is registered in it),
the `driver_push_tokens` table (migration `0006`), and the `notify-drivers` function, started by a Database Webhook.

1. Run `supabase/migrations/0006_push_tokens.sql` in the SQL Editor.
2. Supabase → **Edge Functions** → **Deploy a new function** → name `notify-drivers`, paste `supabase/functions/notify-drivers/index.ts`.
   Turn **off** "Verify JWT".
3. Edge Functions → **Secrets** → add:
   - `FIREBASE_SERVICE_ACCOUNT` = the whole text of the private key `.json` file from Firebase (Project settings → Service accounts → Generate new private key). Keep that file private.
   - `WEBHOOK_SECRET` = any long random text you make up (say 30+ letters and digits).
4. Supabase → **Database** → **Webhooks** → **Create a new hook**: table `jobs`, events **Insert** and **Update**, type **HTTP Request**, method POST, URL = the function's URL (shown on its page, ends in `/functions/v1/notify-drivers`), and add the HTTP header `x-webhook-secret` with the same value as `WEBHOOK_SECRET`.
5. Test: put the driver app on a phone, go online, close the app, then book a job from the customer app.
