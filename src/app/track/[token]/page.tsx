import { Suspense } from "react";
import TrackView from "./TrackView";

// The tracking token is only known at request time, so the view streams in under Suspense.
export default function TrackPage() {
  return (
    <Suspense fallback={<p className="text-center text-stone-500">Loading…</p>}>
      <TrackView />
    </Suspense>
  );
}
