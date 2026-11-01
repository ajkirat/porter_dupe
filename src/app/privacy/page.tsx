import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "[add contact email]";

// DRAFT. Have this reviewed by a qualified person before launch, and keep it matching what the app really does.
export default function Privacy() {
  return (
    <main className="prose-sm mx-auto max-w-2xl space-y-4 p-6 text-stone-800">
      <h1 className="text-2xl font-bold">Pikop: Privacy policy</h1>
      <p className="text-sm text-stone-500">Draft, last updated 1 November 2026.</p>

      <h2 className="text-lg font-semibold">What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Account details:</b> your mobile number.</li>
        <li><b>Orders:</b> pickup and drop addresses and map points, what you are sending, the receiver&apos;s (and sometimes the sender&apos;s) name and phone number, fares, and wallet credit.</li>
        <li><b>Location:</b> your position while the app is open, to set the pickup point. If you choose contacts, only the contact you pick is read; we never upload your address book.</li>
        <li>You pay the driver directly by cash or UPI. We do not handle that money or store card or bank details.</li>
      </ul>

      <h2 className="text-lg font-semibold">Why we use it</h2>
      <p>To book and track your delivery, share needed details with your driver, apply wallet credit and referrals, keep drivers and customers safe, and resolve disputes. We do not sell your data and we do not show ads.</p>

      <h2 className="text-lg font-semibold">Who else handles it</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Supabase: our database and login. Vercel: hosts the app.</li>
        <li>OpenStreetMap services: map pictures and place search receive the places being looked up.</li>
        <li>Our SMS provider: receives your mobile number to send login codes.</li>
        <li>Your driver sees the pickup, drop, item note and the contact details of the sender and receiver for that trip. Anyone with your tracking link can see the live trip.</li>
      </ul>

      <h2 className="text-lg font-semibold">How long we keep it</h2>
      <p>Order records are kept so that disputes and legal needs can be handled, for [add period]. When you delete your account in the app, your saved routes and wallet are removed and your name and number are blanked; past orders stay without your identity. The receiver&apos;s details on past orders are kept with the order record for the same period.</p>

      <h2 className="text-lg font-semibold">Your choices</h2>
      <p>You can delete your account in the app (Account, then Delete my account). You can turn off location in your phone settings and type the pickup address instead. To see or correct your data, contact us below.</p>

      <h2 className="text-lg font-semibold">Contact</h2>
      <p>{CONTACT}</p>
    </main>
  );
}
