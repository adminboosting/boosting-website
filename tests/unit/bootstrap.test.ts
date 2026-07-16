import { describe, expect, it } from "vitest";
import { shouldBootstrap } from "@/lib/auth/bootstrap-core";

// Only the pure decision core is testable here: lib/auth/bootstrap.ts imports
// "server-only" (unresolvable in plain Node) and the service-role client. The
// promotion UPDATE + guard-trigger behavior is pinned by the db suite
// (tests/db/admin-bootstrap.test.ts).

describe("shouldBootstrap", () => {
  it("matches an exact email", () => {
    expect(shouldBootstrap("admin@rankedfrogs.com", "admin@rankedfrogs.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(shouldBootstrap("Admin@RankedFrogs.com", "admin@rankedfrogs.com")).toBe(true);
    expect(shouldBootstrap("admin@rankedfrogs.com", "ADMIN@RANKEDFROGS.COM")).toBe(true);
  });

  it("ignores surrounding whitespace (env values are often pasted)", () => {
    expect(shouldBootstrap("admin@rankedfrogs.com", "  admin@rankedfrogs.com\n")).toBe(true);
    expect(shouldBootstrap(" admin@rankedfrogs.com ", "admin@rankedfrogs.com")).toBe(true);
  });

  it("returns false when ADMIN_BOOTSTRAP_EMAIL is unset or blank", () => {
    expect(shouldBootstrap("admin@rankedfrogs.com", undefined)).toBe(false);
    expect(shouldBootstrap("admin@rankedfrogs.com", null)).toBe(false);
    expect(shouldBootstrap("admin@rankedfrogs.com", "")).toBe(false);
    expect(shouldBootstrap("admin@rankedfrogs.com", "   ")).toBe(false);
  });

  it("returns false when the user email is missing or blank", () => {
    expect(shouldBootstrap(undefined, "admin@rankedfrogs.com")).toBe(false);
    expect(shouldBootstrap(null, "admin@rankedfrogs.com")).toBe(false);
    expect(shouldBootstrap("", "admin@rankedfrogs.com")).toBe(false);
  });

  it("returns false on any mismatch", () => {
    expect(shouldBootstrap("other@rankedfrogs.com", "admin@rankedfrogs.com")).toBe(false);
    expect(shouldBootstrap("admin@rankedfrogs.co", "admin@rankedfrogs.com")).toBe(false);
  });

  it("never treats two blanks as a match", () => {
    expect(shouldBootstrap("", "")).toBe(false);
    expect(shouldBootstrap(undefined, undefined)).toBe(false);
  });
});
