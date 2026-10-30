import { Suspense } from "react";
import OrderView from "./OrderView";

// The order id is only known at request time, so the view streams in under Suspense.
export default function OrderPage() {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
      <OrderView />
    </Suspense>
  );
}
