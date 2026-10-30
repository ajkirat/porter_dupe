import { describe, expect, it } from "vitest";
import { computeFare, DEFAULT_FARE } from "./fare";

describe("computeFare", () => {
  it("charges the minimum for short trips", () => {
    expect(computeFare(500)).toBe(40);
    expect(computeFare(2000)).toBe(40);
  });

  it("adds per-km charge after the included distance, rounded up", () => {
    expect(computeFare(5000)).toBe(70);
    expect(computeFare(5010)).toBe(71);
  });

  it("respects a higher minimum fare", () => {
    expect(computeFare(1000, { ...DEFAULT_FARE, base_fare: 30, min_fare: 50 })).toBe(50);
  });
});
