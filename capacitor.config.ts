import type { CapacitorConfig } from "@capacitor/cli";

// The apps are thin native shells around the live website, so every website deploy updates the apps too.
// A release build must never ship pointing at an old or missing host, so CI refuses to build without the repo variable CUSTOMER_APP_URL.
function appUrl(): string {
  const url = process.env.CUSTOMER_APP_URL;
  if (process.env.CI && (!url || url.includes("netlify"))) {
    throw new Error("Set the GitHub repo variable CUSTOMER_APP_URL to the live Vercel address before building the app.");
  }
  return url || "https://pikop.netlify.app";
}

const config: CapacitorConfig = {
  appId: "app.pikop.customer",
  appName: "Pikop",
  webDir: "www",
  server: {
    url: appUrl(),
    cleartext: false,
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic" },
};

export default config;
