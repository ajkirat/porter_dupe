// UPI deep links. No gateway: the customer's UPI app opens with the payee, amount and note filled in.
const VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

export function validVpa(v: string | null | undefined): v is string {
  return !!v && VPA.test(v.trim());
}

export function upiLink(opts: { vpa: string; name: string; rupees: number; note: string }): string {
  const q = new URLSearchParams({
    pa: opts.vpa.trim(),
    pn: opts.name,
    am: opts.rupees.toFixed(2),
    cu: "INR",
    tn: opts.note.slice(0, 50),
  });
  // URLSearchParams encodes spaces as "+", which some UPI apps show literally.
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

// Open one specific UPI app. The generic upi:// link is also claimed by WhatsApp on many phones, so people end up there.
// Each app has its own address that only it handles. An app that isn't installed simply does nothing, so we offer all of them.
export function upiAppLinks(opts: { vpa: string; name: string; rupees: number; note: string }, ios = false): { id: string; label: string; href: string }[] {
  const generic = upiLink(opts);
  const query = generic.slice(generic.indexOf("?"));
  return [
    { id: "gpay", label: "Google Pay", href: `${ios ? "gpay://upi/pay" : "tez://upi/pay"}${query}` },
    { id: "phonepe", label: "PhonePe", href: `phonepe://pay${query}` },
    { id: "paytm", label: "Paytm", href: `paytmmp://pay${query}` },
    { id: "other", label: "Other UPI app", href: generic },
  ];
}
