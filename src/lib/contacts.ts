import { Capacitor } from "@capacitor/core";
import { Contacts } from "@capacitor-community/contacts";

// Phone contact picker. In the Android and iPhone apps it uses the native picker. In a browser only Android Chrome
// has one; elsewhere the person types the number as before.
const native = () => typeof window !== "undefined" && Capacitor.isNativePlatform();
type ContactsApi = { select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };

function api(): ContactsApi | null {
  if (typeof navigator === "undefined" || !("contacts" in navigator) || typeof window === "undefined" || !("ContactsManager" in window)) return null;
  return (navigator as unknown as { contacts: ContactsApi }).contacts;
}

export const contactsSupported = () => native() || api() !== null;

// The last 10 digits, which drops +91 and a leading 0.
export const tenDigits = (tel: string) => tel.replace(/\D/g, "").slice(-10);

// Returns null if the person closes the picker or the contact has no number.
export async function pickContact(): Promise<{ name: string; phone: string } | null> {
  if (native()) {
    try {
      const perm = await Contacts.requestPermissions();
      if (perm.contacts !== "granted") return null;
      const { contact } = await Contacts.pickContact({ projection: { name: true, phones: true } });
      const tel = contact.phones?.find((p) => p.isPrimary)?.number ?? contact.phones?.[0]?.number;
      if (!tel) return null;
      return { name: contact.name?.display ?? "", phone: tenDigits(tel) };
    } catch {
      return null;
    }
  }
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
