"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map only renders in the browser.
const Map = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-stone-200" />,
});

export default Map;
export type { MapMarker } from "./MapView";
