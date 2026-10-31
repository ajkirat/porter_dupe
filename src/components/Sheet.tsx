"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A card pinned to the bottom of a full-screen map. Reports its height so the
// map can keep the route clear of it.
export default function Sheet({
  children,
  className = "",
  onHeight,
}: {
  children: ReactNode;
  className?: string;
  onHeight?: (px: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  return (
    <div
      ref={ref}
      className={`absolute inset-x-0 bottom-0 z-10 max-h-[80%] overflow-y-auto rounded-t-3xl bg-white px-5 pb-5 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] ${className}`}
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-300" />
      {children}
    </div>
  );
}
