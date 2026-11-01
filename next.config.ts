import type { NextConfig } from "next";

// One codebase, two sites. Set NEXT_PUBLIC_APP_MODE=admin on the admin deployment: it opens straight on the admin
// panel and the customer screens are redirected away. Without it (the customer deployment) /admin is redirected to
// the home page and no link to it is shown. This only hides the screens: admin rights are enforced in the database.
const adminOnly = process.env.NEXT_PUBLIC_APP_MODE === "admin";

const nextConfig: NextConfig = {
  async redirects() {
    if (!adminOnly) return [{ source: "/admin", destination: "/", permanent: false }];
    return ["/", "/account", "/orders", "/orders/:id", "/book"].map((source) => ({ source, destination: "/admin", permanent: false }));
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
