import { describe, expect, it } from "vitest";
import { isValidIndianMobile, toE164 } from "./phone";

describe("toE164", () => {
  it("adds +91 to a 10 digit number", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
  });
  it("drops a leading 0 or 91", () => {
    expect(toE164("09876543210")).toBe("+919876543210");
    expect(toE164("919876543210")).toBe("+919876543210");
  });
  it("keeps explicit country codes", () => {
    expect(toE164("+1 415 555 2671")).toBe("+14155552671");
  });
});

describe("isValidIndianMobile", () => {
  it("accepts numbers starting 6-9 and rejects the rest", () => {
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(isValidIndianMobile("5876543210")).toBe(false);
    expect(isValidIndianMobile("98765")).toBe(false);
  });
});
