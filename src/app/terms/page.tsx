import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "[add contact email]";

// DRAFT. Have this reviewed by a qualified person before launch.
export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-stone-800">
      <h1 className="text-2xl font-bold">Pikop: Terms of use</h1>
      <p className="text-sm text-stone-500">Draft, last updated 1 November 2026.</p>

      <h2 className="text-lg font-semibold">What Pikop is</h2>
      <p>Pikop connects people who want a parcel moved with independent drivers on bikes. Drivers are not our employees. You pay the driver directly, by cash, UPI or QR after delivery; Pikop does not handle that payment.</p>

      <h2 className="text-lg font-semibold">Your orders</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Send only lawful items. Do not send anything illegal, dangerous, or that a driver is not allowed to carry.</li>
        <li>Give correct addresses and a working phone number for the receiver.</li>
        <li>Share the pickup and drop OTPs only with the driver who is with you.</li>
        <li>Pay the driver the fare shown once the parcel is delivered.</li>
      </ul>

      <h2 className="text-lg font-semibold">Wallet credit</h2>
      <p>Wallet credit is a promotional credit. It has no cash value, cannot be withdrawn or transferred, and may expire as shown in the app. We may change or end offers.</p>

      <h2 className="text-lg font-semibold">Liability</h2>
      <p>[Have a qualified person complete this section: loss, damage, insurance and limits.]</p>

      <h2 className="text-lg font-semibold">Contact</h2>
      <p>{CONTACT}</p>
    </main>
  );
}
