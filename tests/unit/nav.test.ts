import { describe, expect, it } from "vitest";
import { accountNavLinks } from "@/lib/auth/nav";
import type { AppRole } from "@/lib/auth/session";

describe("accountNavLinks", () => {
  it("maps every role (and null) to exactly the expected links, in order", () => {
    const matrix: Array<[AppRole | null, Array<{ href: string; label: string }>]> = [
      [null, [{ href: "/account", label: "My orders" }]],
      ["customer", [{ href: "/account", label: "My orders" }]],
      [
        "booster",
        [
          { href: "/account", label: "My orders" },
          { href: "/booster", label: "Booster desk" },
        ],
      ],
      [
        "admin",
        [
          { href: "/account", label: "My orders" },
          { href: "/admin", label: "Admin" },
        ],
      ],
    ];
    for (const [role, expected] of matrix) {
      expect(accountNavLinks(role), `role=${String(role)}`).toEqual(expected);
    }
  });

  it("always leads with My orders and adds at most one role link (compact-slot rule)", () => {
    for (const role of [null, "customer", "booster", "admin"] as Array<AppRole | null>) {
      const links = accountNavLinks(role);
      expect(links[0], `role=${String(role)}`).toEqual({ href: "/account", label: "My orders" });
      expect(links.length, `role=${String(role)}`).toBeLessThanOrEqual(2);
    }
  });

  it("never links a non-staff role to /booster or /admin", () => {
    for (const role of [null, "customer"] as Array<AppRole | null>) {
      const hrefs = accountNavLinks(role).map((link) => link.href);
      expect(hrefs).not.toContain("/booster");
      expect(hrefs).not.toContain("/admin");
    }
    expect(accountNavLinks("booster").map((l) => l.href)).not.toContain("/admin");
    expect(accountNavLinks("admin").map((l) => l.href)).not.toContain("/booster");
  });

  it("returns a fresh array per call (callers may mutate their copy)", () => {
    const first = accountNavLinks("admin");
    first.pop();
    expect(accountNavLinks("admin")).toHaveLength(2);
    expect(accountNavLinks("admin")).not.toBe(first);
  });
});
