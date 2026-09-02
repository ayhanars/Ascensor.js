import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "svg3d-designer-theme";

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function applyThemeAttribute(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

/**
 * Starts following the OS theme. The first explicit toggle click switches
 * to a manual light/dark override (persisted), same as most apps — there's
 * no need for a three-way UI when "system" only ever matters before the
 * first click.
 */
export function useTheme(): { resolved: ResolvedTheme; toggle: () => void } {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    applyThemeAttribute(preference);
  }, [preference]);

  const resolved: ResolvedTheme = preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;

  function toggle() {
    setPreference((prev) => {
      const current: ResolvedTheme = prev === "system" ? (systemPrefersDark ? "dark" : "light") : prev;
      const next: ResolvedTheme = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return { resolved, toggle };
}
