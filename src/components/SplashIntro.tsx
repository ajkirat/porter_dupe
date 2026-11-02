"use client";

import "@fontsource/inter/800.css";
import { useEffect, useRef, useState } from "react";
import { startIntro } from "@/lib/introAnimation";

const SEEN = "pikop-splash-seen";

function markSeen() {
  try { sessionStorage.setItem(SEEN, "1"); } catch { /* ignore */ }
}

// Opening screen: shown once each time the app is opened (not when moving between pages). Tap to skip.
export default function SplashIntro() {
  const [show, setShow] = useState(true);
  const [fade, setFade] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === "1"; } catch { /* private mode: just show it */ }
    if (seen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(false);
      return;
    }
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const end = () => { markSeen(); setFade(true); timer = setTimeout(() => setShow(false), 350); };
    // The animation measures the letters, so wait for the bundled font first (but never longer than 1.5 s).
    Promise.race([document.fonts.load("800 92px Inter"), new Promise((r) => setTimeout(r, 1500))]).then(() => {
      if (!svg.current) return;
      stop = startIntro(svg.current, () => { timer = setTimeout(end, reduce ? 700 : 600); }, reduce);
    });
    return () => { stop(); clearTimeout(timer); };
  }, []);

  if (!show) return null;
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-white transition-opacity duration-300 ${fade ? "opacity-0" : "opacity-100"}`}
      onClick={() => { markSeen(); setFade(true); setTimeout(() => setShow(false), 300); }}
      role="presentation"
    >
      <svg ref={svg} viewBox="0 0 420 220" className="h-auto w-[min(88vw,400px)]" aria-label="Pikop" />
    </div>
  );
}
