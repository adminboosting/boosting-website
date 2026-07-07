import { describe, expect, it } from "vitest";
import { applyBp, formatUsdFromCents, roundHalfUp } from "@/lib/money";

describe("roundHalfUp", () => {
  it("rounds halves up", () => {
    expect(roundHalfUp(204.5)).toBe(205);
    expect(roundHalfUp(204.49)).toBe(204);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1593.75)).toBe(1594);
    expect(roundHalfUp(100)).toBe(100);
  });
});

describe("applyBp", () => {
  it("applies basis points, rounded half-up", () => {
    expect(applyBp(1800, 2000)).toBe(360); // +20%
    expect(applyBp(1365, 1500)).toBe(205); // 204.75 -> 205
    expect(applyBp(27200, 1800)).toBe(4896); // 18%
    expect(applyBp(1000, 0)).toBe(0);
  });
});

describe("formatUsdFromCents", () => {
  it("formats cents as USD", () => {
    expect(formatUsdFromCents(1875)).toBe("$18.75");
    expect(formatUsdFromCents(0)).toBe("$0.00");
    expect(formatUsdFromCents(100000)).toBe("$1,000.00");
  });
});
