import { describe, expect, it } from "vitest";
import { capacity, sizeCm, sizeFeet } from "./vehicles";

describe("vehicles", () => {
  it("shows feet and cm", () => {
    const v = { length_cm: 168, width_cm: 122, height_cm: 122, max_kg: 500 };
    expect(sizeFeet(v)).toBe("6 × 4 × 4 ft");
    expect(sizeCm(v)).toBe("168 × 122 × 122 cm");
    expect(capacity(v)).toBe("Up to 500 kg");
  });
});
