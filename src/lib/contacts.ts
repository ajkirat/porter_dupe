// Phone contact picker. Browsers only offer it on Android Chrome (and Android apps built on it); elsewhere the
// button stays hidden and the person types the number as before.
type ContactsApi = { select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };

function api(): ContactsApi | null {
  if (typeof navigator === "undefined" || !("contacts" in navigator) || typeof window === "undefined" || !("ContactsManager" in window)) return null;
  return (navigator as unknown as { contacts: ContactsApi }).contacts;
}

export const contactsSupported = () => api() !== null;

// The last 10 digits, which drops +91 and a leading 0.
export const tenDigits = (tel: string) => tel.replace(/\D/g, "").slice(-10);

// Returns null if the person closes the picker or the contact has no number.
export async function pickContact(): Promise<{ name: string; phone: string } | null> {
  const c = api();
  if (!c) return null;
  try {
    const [pick] = await c.select(["name", "tel"], { multiple: false });
    const tel = pick?.tel?.[0];
    if (!tel) return null;
    return { name: pick.name?.[0] ?? "", phone: tenDigits(tel) };
  } catch {
    return null;
  }
}
