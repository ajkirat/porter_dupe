import { describe, expect, it } from "vitest";
import { upiLink, validVpa } from "./upi";

describe("upi", () => {
  it("validates ids", () => {
    expect(validVpa("ravi@okaxis")).toBe(true);
    expect(validVpa("9876543210@ybl")).toBe(true);
    expect(validVpa("ravi")).toBe(false);
    expect(validVpa("a b@ybl")).toBe(false);
    expect(validVpa(null)).toBe(false);
  });
  it("builds a link", () => {
    const l = upiLink({ vpa: "ravi@okaxis", name: "Ravi K", rupees: 85, note: "Pikop order" });
    expect(l).toBe("upi://pay?pa=ravi%40okaxis&pn=Ravi%20K&am=85.00&cu=INR&tn=Pikop%20order");
  });
});
