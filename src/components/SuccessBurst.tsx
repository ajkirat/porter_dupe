"use client";

// A check mark that pops in with a ring and a few specks flying out. Pure CSS, and still when the phone asks for less motion.
const SPECKS = [
  { x: -46, y: -38, c: "#f59e0b" }, { x: 44, y: -42, c: "#22c55e" }, { x: -58, y: 6, c: "#ea580c" },
  { x: 58, y: 10, c: "#3b82f6" }, { x: -34, y: 48, c: "#22c55e" }, { x: 36, y: 50, c: "#f59e0b" },
];

export default function SuccessBurst({ className = "h-20 w-20" }: { className?: string }) {
  return (
    <div className={`relative mx-auto ${className}`} aria-hidden>
      <style>{`
        @keyframes sb-pop { 0% { transform: scale(0.2); opacity: 0 } 60% { transform: scale(1.15); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes sb-ring { 0% { transform: scale(0.6); opacity: 0.7 } 100% { transform: scale(1.7); opacity: 0 } }
        @keyframes sb-fly { 0% { transform: translate(0,0) scale(0.4); opacity: 1 } 100% { transform: translate(var(--x),var(--y)) scale(1); opacity: 0 } }
        @keyframes sb-draw { to { stroke-dashoffset: 0 } }
        .sb-pop { animation: sb-pop .5s cubic-bezier(.2,.9,.3,1.2) both }
        .sb-ring { animation: sb-ring .8s ease-out .15s both }
        .sb-speck { animation: sb-fly .9s ease-out .2s both }
        .sb-check { stroke-dasharray: 30; stroke-dashoffset: 30; animation: sb-draw .35s ease-out .3s forwards }
        @media (prefers-reduced-motion: reduce) { .sb-pop,.sb-ring,.sb-speck,.sb-check { animation: none } .sb-ring,.sb-speck { display: none } .sb-check { stroke-dashoffset: 0 } }
      `}</style>
      <span className="sb-ring absolute inset-0 rounded-full border-4 border-green-500" />
      {SPECKS.map((s, i) => (
        <span key={i} className="sb-speck absolute left-1/2 top-1/2 h-2 w-2 rounded-full" style={{ background: s.c, ["--x" as string]: `${s.x}px`, ["--y" as string]: `${s.y}px` }} />
      ))}
      <span className="sb-pop absolute inset-0 flex items-center justify-center rounded-full bg-green-600 text-white">
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path className="sb-check" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </div>
  );
}
