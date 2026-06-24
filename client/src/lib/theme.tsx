// ─── Theme system ─────────────────────────────────────────────────
// Custom React Context (next-themes-style API but native to Vite).
// - Persists choice in localStorage under "collabspace.theme".
// - Defaults to the OS preference on first load.
// - Adds a temporary `.theme-transitioning` class to animate the
//   cross-fade between themes without flickering per-element transitions.
//
// Usage:
//   const { theme, setTheme, resolvedTheme, toggleTheme } = useTheme();
//   <button onClick={toggleTheme}>…</button>

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark";
export type ResolvedTheme = ThemeMode; // (no system in v1)

const STORAGE_KEY = "collabspace.theme";

interface ThemeContextValue {
  /** The user's chosen theme (light | dark). May differ from `resolvedTheme` only briefly during transitions. */
  theme: ThemeMode;
  /** What's currently applied to <html data-theme="…">. */
  resolvedTheme: ResolvedTheme;
  /** Set a specific theme. */
  setTheme: (next: ThemeMode) => void;
  /** Flip light <-> dark. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be unavailable (private mode, etc.)
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // Update the OS-level UI tint (Safari, mobile chrome address bar).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "light" ? "#f8fafc" : "#0a0e17");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);

  // Apply on mount + whenever theme changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Cross-fade transition: add a temporary class for ~250ms so the
  // token swap isn't visually jarring.
  const setTheme = useCallback((next: ThemeMode) => {
    if (typeof document === "undefined") {
      setThemeState(next);
      return;
    }
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
    }, 280);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  // Subscribe to OS-level theme changes ONLY if the user hasn't picked one yet.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (stored === "light" || stored === "dark") return; // user has chosen

    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "light" : "dark");
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
