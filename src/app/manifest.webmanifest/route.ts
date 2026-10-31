import { APP_NAME, TAGLINE } from "@/lib/brand";

// Customer app manifest. The driver app is a separate site with its own manifest.
export function GET() {
  return Response.json(
    {
      id: "/",
      name: APP_NAME,
      short_name: APP_NAME,
      description: TAGLINE,
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#ea580c",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
