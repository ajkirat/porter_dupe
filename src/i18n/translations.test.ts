import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TAGLINE } from "../lib/brand";
import { STATUS_LABEL } from "../lib/types";
import { translate } from "./index";
import { TRANSLATIONS } from "./translations";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/test|translations/.test(f) ? [p] : [];
  });
}

describe("translations", () => {
  const used = new Set<string>();
  for (const f of files("src")) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) used.add(m[1].replace(/\\"/g, '"'));
  }
  // Strings that reach t() through variables instead of a literal call.
  [
    TAGLINE,
    "Pick it up, drop it off, pay the driver directly. No hidden charges.",
    "Send", "Orders", "Account", "Pickup location", "Drop location", "Cash", "UPI app", "QR code",
    "Finding a driver near you", "Driver is on the way to pickup", "Your parcel is on its way", "Order cancelled",
    "Welcome credit", "Referral reward", "Used on a trip", "Refund for a cancelled trip", "Adjustment by Pikop",
    ...Object.values(STATUS_LABEL),
  ].forEach((k) => used.add(k));

  it("has Hindi and Kannada for every string the customer app uses", () => {
    const missing = [...used].filter((k) => !TRANSLATIONS[k]?.hi || !TRANSLATIONS[k]?.kn);
    expect(missing).toEqual([]);
  });

  it("keeps the same {placeholders} in every language", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [k, v] of Object.entries(TRANSLATIONS)) {
      expect(ph(v.hi), k).toBe(ph(k));
      expect(ph(v.kn), k).toBe(ph(k));
    }
  });

  it("fills placeholders and falls back to English", () => {
    expect(translate("hi", "Resend in {s}s", { s: 5 })).toBe("5 सेकंड में दोबारा भेजें");
    expect(translate("kn", "No such key {x}", { x: 1 })).toBe("No such key 1");
  });
});
