import { describe, expect, it } from "vitest";
import { upiAppLinks, upiLink, validVpa } from "./upi";

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
  it("builds one link per app, each with the same payment details", () => {
    const o = { vpa: "ravi@okaxis", name: "Ravi K", rupees: 85, note: "Pikop order" };
    const links = upiAppLinks(o);
    expect(links.map((l) => l.id)).toEqual(["gpay", "phonepe", "paytm", "other"]);
    expect(links[0].href).toBe("tez://upi/pay?pa=ravi%40okaxis&pn=Ravi%20K&am=85.00&cu=INR&tn=Pikop%20order");
    expect(links[1].href.startsWith("phonepe://pay?pa=")).toBe(true);
    expect(links[2].href.startsWith("paytmmp://pay?pa=")).toBe(true);
    expect(links[3].href).toBe(upiLink(o));
    expect(upiAppLinks(o, true)[0].href.startsWith("gpay://upi/pay?")).toBe(true);
  });
});
