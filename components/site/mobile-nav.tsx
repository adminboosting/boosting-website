"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileNavLink {
  href: string;
  label: string;
}

/**
 * Below-md disclosure menu for the marketing nav links. Deliberately plain:
 * one `useState`, no portal/overlay/focus-trap machinery. The panel hangs off
 * the sticky header (the header is the nearest positioned ancestor, so
 * `top-full` lands it flush under the 16-unit bar) and every link closes the
 * menu on navigate so it never lingers over the next page.
 */
export function MobileNav({ links }: { links: MobileNavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </Button>

      {open && (
        <nav
          id="mobile-nav-panel"
          aria-label="Site navigation"
          className="absolute inset-x-0 top-full border-b border-border/60 bg-background/95 backdrop-blur"
        >
          <ul className="mx-auto w-full max-w-6xl px-6 py-3">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
