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
