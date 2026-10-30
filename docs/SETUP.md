# Setup in baby steps

This gets the app live on a Vercel URL with a working database, then walks through one test delivery. No local install is needed. Budget about 30 minutes. Everything here is on free tiers.

You'll need: a GitHub login (you have one), and an email address to sign up for Supabase and Vercel.

---

## Step 1. Create the Supabase project (5 min)

1. Go to <https://supabase.com/dashboard> and sign in with GitHub.
2. Click **New project**.
3. Name: `porter-dupe`. Database password: click **Generate a password** and save it in your password manager (you won't need it for this guide).
4. Region: **South Asia (Mumbai)**, which is closest to Bengaluru.
5. Click **Create new project** and wait about 2 minutes until the dashboard stops showing "Setting up project".

## Step 2. Create the tables (3 min)

1. In the left sidebar, open **SQL Editor**.
2. Open [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) on GitHub, click **Raw**, select all and copy.
3. Paste it into the SQL editor and click **Run**. You should see "Success. No rows returned".
4. Click **+** for a new query, and do the same with [`supabase/migrations/0002_storage.sql`](../supabase/migrations/0002_storage.sql).

Check: **Table Editor** in the sidebar now lists `drivers`, `jobs`, `profiles`, `settings` and a few more.

## Step 3. Turn on phone login with test numbers (5 min)

Real SMS costs money, so for now we use fake numbers with a fixed code. Nothing is actually sent.

1. Sidebar: **Authentication** → **Sign In / Providers** → **Phone**.
2. Turn on **Enable Phone provider**.
3. SMS provider: choose **Twilio**. Supabase insists on one even for test numbers but never uses it for them. Fill in placeholders:
   - Account SID: `AC00000000000000000000000000000000`
   - Auth Token: `placeholder`
   - Message Service SID: `MG00000000000000000000000000000000`

   (If Supabase refuses to save placeholders, create a free Twilio trial account and paste its real values instead.)
4. **Test Phone Numbers and OTPs**: paste
   ```
   919000000001=123456,919000000002=123456
   ```
   The first will be your **customer + admin** account, the second your **driver** account.
5. **Test OTPs Valid Until**: pick a date a few months out.
6. Click **Save**.

## Step 4. Copy your two keys (1 min)

1. Click the **Connect** button at the top of the project dashboard (or go to **Project Settings** → **API Keys**).
2. Copy and keep somewhere for the next step:
   - **Project URL**, which looks like `https://abcdxyz.supabase.co`
   - **anon public** key (a long string starting `eyJ...`). If you only see a **Publishable key** (`sb_publishable_...`), use that instead; it works the same.

## Step 5. Deploy to Vercel (5 min)

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Under **Import Git Repository**, find `porter_dupe` and click **Import**. If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to that repo.
3. Leave Framework (Next.js) and build settings as they are.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 4 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key from step 4 |
   | `NEXT_PUBLIC_OPERATOR_UPI` | your UPI ID (drivers pay their pass here) |

5. Click **Deploy** and wait about 2 minutes. You'll get a URL like `https://porter-dupe.vercel.app`. Open it: you should see "Send a parcel across Bengaluru by bike".

From now on, every push to `main` updates that URL, and every other branch or pull request gets its own **preview URL** automatically (Vercel comments it on the pull request).

> Changed an environment variable later? Vercel only picks it up on the next deploy: **Deployments** → latest → **⋯** → **Redeploy**.

## Step 6. Make yourself admin (2 min)

1. On your Vercel URL, go to `/admin`, enter `9000000001`, tap **Send OTP**, enter `123456`. You'll see "This account isn't an admin".
2. In Supabase **SQL Editor**, run:
   ```sql
   update profiles set is_admin = true where phone = '919000000001';
   ```
3. Refresh `/admin`. You should now see Trips, Drivers and Settings.

## Step 7. Test a full delivery (10 min)

Use two browser windows: your normal one is the **customer/admin** (`9000000001`), and a private/incognito window is the **driver** (`9000000002`). On a phone, allow location when asked.

**Driver signs up** (incognito window)

1. Open your URL → **Drive**. Sign in with `9000000002` / `123456`.
2. Fill the form with any test details and add any four photos for the documents. **Submit for approval**. You'll see "We're checking your documents".

**Admin approves** (normal window)

3. `/admin` → **Drivers** → **Approve**, then **+ Day pass**.

**Driver goes online** (incognito)

4. Refresh **Drive**. Tap **Go online** and allow location.

**Customer books** (normal window)

5. **Send** → set pickup and drop (search a place, or tap the map), fill receiver name and phone, tap **Book**.
6. Note the **Pickup OTP** and **Drop OTP** on the order page.

**Driver delivers** (incognito)

7. The job appears under "Jobs near you" (it refreshes by itself within 20 seconds). If it doesn't, your browser location is probably more than 6 km from the pickup. Use **Admin → Trips → Offer to driver** instead.
8. **Accept** → enter the pickup OTP → **Confirm pickup** → enter the drop OTP → **Confirm delivery**.

**Check**: the customer's order page now says **Delivered**. 🎉

## Step 8 (optional). Run it on your laptop

```bash
git clone https://github.com/ajkirat/porter_dupe.git
cd porter_dupe
cp .env.example .env.local     # paste the same values as step 5
npm install
npm run dev                     # open http://localhost:3000
```

---

## Before real users

- **Real SMS**: replace the Twilio placeholders with a real provider (Twilio, or MSG91 via a Supabase SMS hook, is cheaper for India) and delete the test numbers.
- **Maps at volume**: the free OpenStreetMap servers are fine for a pilot; see the README for self-hosting once trips grow.
