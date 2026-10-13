import { Priority, Status } from './types'

export const C = {
  bg: '#FFFFFF',
  surface: '#F5F5F7',
  surfaceAlt: '#ECECF0',
  border: '#E3E3E8',
  borderStrong: '#CFCFD6',
  text: '#1D1D22',
  muted: '#6A6A75',
  faint: '#9C9CA6',
  accent: '#3B5BDB',
  accentSoft: '#E9EEFB',
  danger: '#C92A2A',
  dangerSoft: '#FDEBEB',
  warn: '#B35C00',
  warnSoft: '#FFF2E0',
  success: '#2B8A3E',
  successSoft: '#E6F4EA',
}

export const STATUS_COLOR: Record<Status, string> = {
  todo: '#6A6A75',
  inprogress: '#2F6FED',
  blocked: '#D9480F',
  done: '#2B8A3E',
}

export const STATUS_SOFT: Record<Status, string> = {
  todo: '#EEEEF2',
  inprogress: '#E6EEFD',
  blocked: '#FDEDE5',
  done: '#E6F4EA',
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#C92A2A',
  medium: '#B35C00',
  low: '#6A6A75',
}

export const PRIORITY_SOFT: Record<Priority, string> = {
  high: '#FDEBEB',
  medium: '#FFF2E0',
  low: '#EEEEF2',
}

const wrap = (inner: string, color: string, size: number, sw: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

export type IconName =
  | 'circle'
  | 'half'
  | 'blocked'
  | 'check'
  | 'checkCircle'
  | 'checkFilled'
  | 'plus'
  | 'search'
  | 'filter'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronUp'
  | 'calendar'
  | 'user'
  | 'x'
  | 'archive'
  | 'undo'
  | 'trash'
  | 'flag'
  | 'flagFilled'
  | 'clock'
  | 'alert'
  | 'board'
  | 'week'
  | 'dots'

const PATHS: Record<IconName, (c: string) => string> = {
  circle: () => '<circle cx="12" cy="12" r="8.5"/>',
  half: (c) => `<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="${c}" stroke="none"/>`,
  blocked: () => '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  check: () => '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: () => '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  checkFilled: (c) => `<circle cx="12" cy="12" r="8.5" fill="${c}"/><path d="M8 12.5l2.8 2.8L16.5 9.5" stroke="#FFFFFF" stroke-width="2.2"/>`,
  plus: () => '<path d="M12 5v14M5 12h14"/>',
  search: () => '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  filter: () => '<path d="M4 6h16M7 12h10M10 18h4"/>',
  chevronDown: () => '<path d="M6 9l6 6 6-6"/>',
  chevronRight: () => '<path d="M9 6l6 6-6 6"/>',
  chevronUp: () => '<path d="M6 15l6-6 6 6"/>',
  calendar: () => '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  user: () => '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  x: () => '<path d="M6 6l12 12M18 6L6 18"/>',
  archive: () => '<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V20h14V8.5M10 13h4"/>',
  undo: () => '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: () => '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  flag: () => '<path d="M5 21V4h13l-2.5 4.5L18 13H5"/>',
  flagFilled: (c) => `<path d="M5 21V4h13l-2.5 4.5L18 13H5" fill="${c}"/>`,
  clock: () => '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: () => '<path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  board: () => '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="11" rx="1"/><rect x="16" y="4" width="5" height="7" rx="1"/>',
  week: () => '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M13 14h3M8 17.5h3"/>',
  dots: () => '<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
}

export function icon(name: IconName, color: string, size = 12, strokeWidth = 1.8): string {
  return wrap(PATHS[name](color), color, size, strokeWidth)
}

export const STATUS_ICON: Record<Status, IconName> = {
  todo: 'circle',
  inprogress: 'half',
  blocked: 'blocked',
  done: 'checkCircle',
}
