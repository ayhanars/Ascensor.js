import type { Units } from "../types";

/**
 * Every length is stored and computed in mm everywhere else in the app —
 * the scene model, extrusion, STL export, none of it ever changes. `Units`
 * is purely a display/input convenience: format a stored mm value for
 * whatever unit the user prefers to think in, and convert their typed
 * value back to mm before it ever reaches the store.
 */
const MM_PER_UNIT: Record<Units, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
};

export const UNIT_LABELS: Record<Units, string> = {
  mm: "mm",
  cm: "cm",
  in: "in",
};

export function mmToDisplay(mm: number, unit: Units): number {
  return mm / MM_PER_UNIT[unit];
}

export function displayToMM(value: number, unit: Units): number {
  return value * MM_PER_UNIT[unit];
}

/** Rounds for on-screen display — more decimal places for the smaller
 * inch/cm numbers than mm typically needs. */
export function formatLength(mm: number, unit: Units): string {
  const value = mmToDisplay(mm, unit);
  const decimals = unit === "in" ? 3 : unit === "cm" ? 2 : 1;
  return `${Math.round(value * 10 ** decimals) / 10 ** decimals}`;
}
