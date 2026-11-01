# Publishing the customer app (Google Play and Apple App Store)

The driver app is Android only (see the driver repo's `docs/PLAY_STORE.md`). The customer app ships on both stores.
Both apps are thin native shells around the live website, so a website deploy updates the apps too. Native code
only provides the shell, the contacts picker and the permission prompts.

Bundle ids: Android `app.pikop.customer`, iPhone `app.pikop.customer`. Set `CUSTOMER_APP_URL` (GitHub repo variable) to your
live customer site, for example the Vercel address.

Before either store: run migration `0012_delete_account.sql` (in-app account deletion is mandatory on both stores) and
fill in the contact email and retention period in `/privacy`.

## Google Play (customer app)
1. Actions → **Create Android upload key (run once)** → download the artifact → save secrets `ANDROID_KEYSTORE_BASE64` and
   `ANDROID_KEYSTORE_PASSWORD` (same steps as the driver repo). Use a different key from the driver app.
2. Push to `main` or run **Build Android**. Download `pikop-customer-test-apk` to try on a phone, and
   `pikop-customer-play-bundle` (`.aab`) to upload in Play Console.
3. Play Console: create the app, fill Data safety (phone number, location, contacts the user picks; none sold),
   content rating, privacy policy URL (`/privacy` on your site), and the account deletion URL.
4. A personal developer account made after Nov 2023 needs a closed test with 12 testers for 14 days before production.

## Apple App Store (customer app)
You need: an Apple Developer Program membership (about USD 99 per year) and, for local builds, a Mac with Xcode.
The workflow **Build iOS** compiles the app on a cloud Mac on every push, so breakage shows early, without a Mac.

To get builds onto iPhones through TestFlight from GitHub, set these repository secrets:
| Secret | What it is |
| --- | --- |
| `APPLE_TEAM_ID` | 10 character team id from developer.apple.com → Membership |
| `IOS_CERT_P12_BASE64` | an "Apple Distribution" certificate exported as .p12, base64 encoded |
| `IOS_CERT_PASSWORD` | the password you set when exporting the .p12 |
| `IOS_PROFILE_BASE64` | an App Store provisioning profile for `app.pikop.customer`, base64 encoded |
| `APPSTORE_KEY_BASE64`, `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID` | an App Store Connect API key (.p8) and its ids |

Then create the app record in App Store Connect with bundle id `app.pikop.customer`. Each push uploads a build to TestFlight;
add testers there. The signed path is written but untested, since it needs your Apple account. Expect to fix a small thing
or two on the first run.

### Apple review risks (read this)
- Apple can reject an app that is only a website in a frame (guideline 4.2). This app adds native contact picking and
  location prompts, which helps, but it is not a guarantee. If rejected, native screens (for example order tracking
  with push notifications) are the usual answer.
- It needs a working privacy policy URL, the in-app account deletion (done), and demo login details for reviewers: use a
  test phone number with a fixed OTP, and say so in the review notes.
- The app takes no in-app payment: you pay the driver in person for a real-world delivery, which Apple allows.

## Before real users
Replace the placeholder app icon and splash screens (the icon is the website icon, scaled), and have the privacy policy
and terms reviewed by a qualified person.
