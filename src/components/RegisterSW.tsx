"use client";

import { useEffect } from "react";
import "@/lib/sound"; // registers the first-tap audio unlock

// A pass-through service worker; its presence lets browsers offer "Install app".
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
