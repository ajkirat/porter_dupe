import type { CapacitorConfig } from "@capacitor/cli";

// The apps are thin native shells around the live website, so every website deploy updates the apps too.
const config: CapacitorConfig = {
  appId: "app.pikop.customer",
  appName: "Pikop",
  webDir: "www",
  server: {
    url: process.env.CUSTOMER_APP_URL || "https://pikop.netlify.app",
    cleartext: false,
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic" },
};

export default config;
