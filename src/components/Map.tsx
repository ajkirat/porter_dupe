"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map only renders in the browser.
const Map = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-stone-200" />,
});

export default Map;
export type { MapFocus, MapMarker } from "./MapView";
