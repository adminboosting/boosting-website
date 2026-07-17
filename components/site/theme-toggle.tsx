"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Light/dark toggle. The theme is a `.dark` class on <html> (see the
 * `@custom-variant dark` in globals.css). The initial class is set by the
 * blocking THEME_INIT_SCRIPT in the root layout BEFORE paint (no flash); this
 * button only flips it and persists the explicit choice to localStorage.
 *
 * Stateless by design: the two icons are both rendered and CSS shows the one
 * matching the active `.dark` class, so the control is correct on the server,
 * before hydration, and after every toggle — no React state, no hydration
 * mismatch, no flash.
 */
export function ThemeToggle() {
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage can throw in private mode — the class still applies.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label="Toggle light or dark theme"
      title="Toggle theme"
    >
      <Sun className="size-[18px] dark:hidden" />
      <Moon className="hidden size-[18px] dark:block" />
    </button>
  );
}

/**
 * Blocking, dependency-free init run as the first thing in <body>. Applies the
 * explicit stored choice, else the OS preference, so the correct theme paints
 * on first frame. Kept tiny and standalone (stringified into the layout).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
