const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n: number) => (n < 10 ? '0' + n : String(n))

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
  return new Date(y, m - 1, d)
}

/** Whole-day index of an ISO date (no Date object needed for differences). */
export function dayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export function nextMondayISO(): string {
  const d = new Date()
  const day = d.getDay() // 0 = Sun
  const delta = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + delta)
  return toISO(d)
}

/** Whole days from today to the given date (negative = past). */
export function daysFromToday(iso: string): number {
  const a = parseISO(todayISO()).getTime()
  const b = parseISO(iso).getTime()
  return Math.round((b - a) / 86400000)
}

export function isOverdue(iso: string | null): boolean {
  return !!iso && daysFromToday(iso) < 0
}

export function shortDate(iso: string): string {
  const d = parseISO(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function weekdayDate(iso: string): string {
  const d = parseISO(iso)
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** Compact label used on cards: Today / Tomorrow / Mon 14 / Oct 14 */
export function dueLabel(iso: string): string {
  const diff = daysFromToday(iso)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) {
    const d = parseISO(iso)
    return `${DAYS[d.getDay()]} ${d.getDate()}`
  }
  return shortDate(iso)
}

export function fromTimestamp(ts: number): string {
  return shortDate(toISO(new Date(ts)))
}

export function ageInDays(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000)
}

// --- submission periods (ISO weeks, calendar months)
export type PeriodKind = 'week' | 'month'
export interface Period {
  kind: PeriodKind
  /** Storage key: 2026-W42 or 2026-10 */
  key: string
  start: string
  end: string
  label: string
}
const pad2 = (n: number) => (n < 10 ? '0' + n : '' + n)
/** ISO week of a date: Monday start, week 1 holds January 4th. */
export function isoWeek(d: Date): { year: number; week: number; monday: Date } {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const monday = new Date(t)
  monday.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  const thursday = new Date(monday)
  thursday.setDate(monday.getDate() + 3)
  const year = thursday.getFullYear()
  const jan4 = new Date(year, 0, 4)
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1
  return { year, week, monday }
}
export function weekKeyOf(d: Date): string {
  const w = isoWeek(d)
  return `${w.year}-W${pad2(w.week)}`
}
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}
/** The period `offset` steps away from the current one (0 = this week / this month, -1 = last). */
export function periodFor(kind: PeriodKind, offset: number, now: Date = new Date()): Period {
  if (kind === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() + offset * 7)
    const w = isoWeek(d)
    const sunday = new Date(w.monday)
    sunday.setDate(w.monday.getDate() + 6)
    const start = toISO(w.monday)
    const end = toISO(sunday)
    return { kind, key: `${w.year}-W${pad2(w.week)}`, start, end, label: `Week ${w.week} · ${shortDate(start)} – ${shortDate(end)}` }
  }
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  return { kind, key: monthKeyOf(first), start: toISO(first), end: toISO(last), label: `${MONTHS[first.getMonth()]} ${first.getFullYear()}` }
}
/** ISO weeks that belong to a month (the week's Thursday falls in it). */
export function weekKeysInMonth(monthKey: string): string[] {
  const y = parseInt(monthKey.slice(0, 4), 10)
  const m = parseInt(monthKey.slice(5, 7), 10) - 1
  const out: string[] = []
  for (let day = 1; day <= 31; day++) {
    const d = new Date(y, m, day)
    if (d.getMonth() !== m) break
    if (d.getDay() === 4) out.push(weekKeyOf(d))
  }
  return out
}
/** The ISO week period for a stored key like 2026-W42. */
export function weekPeriod(key: string): Period {
  const year = parseInt(key.slice(0, 4), 10)
  const week = parseInt(key.slice(6, 8), 10)
  const jan4 = new Date(year, 0, 4)
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7)
  return periodFor('week', 0, monday)
}
