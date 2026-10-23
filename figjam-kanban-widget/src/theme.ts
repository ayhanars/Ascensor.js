import { Priority, Status } from './types'

/** Neutral palette + indigo accent. */
export const C = {
  bg: '#FFFFFF',
  canvas: '#FAFAFB',
  surface: '#F3F4F6',
  surfaceAlt: '#E9EAEE',
  border: '#E5E7EB',
  borderStrong: '#CBD0D8',
  text: '#111827',
  muted: '#6B7280',
  /** For 9–10px chip text on grey: 7:1 on #F3F4F6. */
  mutedStrong: '#4B5563',
  faint: '#9CA3AF',
  accent: '#4F46E5',
  accentHover: '#4338CA',
  accentSoft: '#EEF2FF',
  accentText: '#3730A3',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warn: '#B45309',
  warnSoft: '#FEF3C7',
  success: '#059669',
  successSoft: '#D1FAE5',
}

/** Strong colour per status (glyphs, bars, labels). */
export const STATUS_COLOR: Record<Status, string> = {
  todo: '#64748B',
  inprogress: '#2563EB',
  blocked: '#EA580C',
  done: '#059669',
}

/** Soft fill per status (pills, hover). */
export const STATUS_SOFT: Record<Status, string> = {
  todo: '#E2E8F0',
  inprogress: '#DBEAFE',
  blocked: '#FFEDD5',
  done: '#D1FAE5',
}

/** Column background tint per status — this is what makes sections differ. */
export const STATUS_TINT: Record<Status, string> = {
  todo: '#F1F3F6',
  inprogress: '#EDF3FF',
  blocked: '#FFF3EB',
  done: '#ECF8F2',
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#BE123C',
  medium: '#B45309',
  low: '#64748B',
}

export const PRIORITY_SOFT: Record<Priority, string> = {
  high: '#FFE4E6',
  medium: '#FEF3C7',
  low: '#E2E8F0',
}

/** Arrow + label so priority never relies on colour alone. */
export const PRIORITY_GLYPH: Record<Priority, string> = {
  high: '↑ High',
  medium: '→ Med',
  low: '↓ Low',
}

/** Pastel avatar colours, picked deterministically from the name. */
const AVATARS: Array<[string, string]> = [
  ['#DBEAFE', '#1D4ED8'],
  ['#FCE7F3', '#BE185D'],
  ['#D1FAE5', '#047857'],
  ['#FEF3C7', '#B45309'],
  ['#EDE9FE', '#6D28D9'],
  ['#FFEDD5', '#C2410C'],
  ['#CFFAFE', '#0E7490'],
  ['#E2E8F0', '#334155'],
]

export function avatarColors(name: string): [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATARS[h % AVATARS.length]
}

/** Label colours: a separate, slightly stronger set so labels read differently from avatars. */
const LABELS: Array<[string, string]> = [
  ['#E0E7FF', '#3730A3'],
  ['#FCE7F3', '#9D174D'],
  ['#D1FAE5', '#065F46'],
  ['#FEF3C7', '#92400E'],
  ['#CFFAFE', '#155E75'],
  ['#FFE4E6', '#9F1239'],
  ['#EDE9FE', '#5B21B6'],
  ['#ECFCCB', '#3F6212'],
]

export function labelColors(name: string): [string, string] {
  let h = 7
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0
  return LABELS[h % LABELS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ---------------------------------------------------------------------------
// SVG icons — used ONLY in the header / panels (a handful per render).
// Cards never use SVG: every SVG string is re-parsed on each render, which is
// the main source of lag in large widgets.
// ---------------------------------------------------------------------------
const wrap = (inner: string, color: string, size: number, sw: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

export type IconName =
  | 'plus'
  | 'search'
  | 'filter'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronUp'
  | 'calendar'
  | 'x'
  | 'archive'
  | 'undo'
  | 'trash'
  | 'board'
  | 'week'
  | 'check'
  | 'alert'
  | 'clock'
  | 'user'
  | 'tag'
  | 'list'
  | 'download'
  | 'upload'
  | 'chat'
  | 'users'
  | 'sticky'
  | 'refresh'

const PATHS: Record<IconName, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V20h14V8.5M10 13h4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="11" rx="1"/><rect x="16" y="4" width="5" height="7" rx="1"/>',
  week: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M13 14h3M8 17.5h3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  tag: '<path d="M3 11V4h7l10 10-7 7z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 19h16"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5M4 19h16"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3"/>',
  sticky: '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
}

export function icon(name: IconName, color: string, size = 12, strokeWidth = 1.8): string {
  return wrap(PATHS[name], color, size, strokeWidth)
}
