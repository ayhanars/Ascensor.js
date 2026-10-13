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
