import {
  ACTIVE_STATUSES,
  EMPTY_FILTERS,
  Filters,
  Person,
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  Scope,
  SortMode,
  STATUSES,
  STATUS_LABEL,
  STATUS_SHORT,
  Status,
  Subtask,
  Task,
  View,
} from './types'
import { Period, addDaysISO, ageInDays, dayIndex, fromTimestamp, parseISO, periodFor, todayISO, toISO, weekPeriod, weekdayDate, weekKeysInMonth } from './dates'
import {
  C,
  PRIORITY_COLOR,
  PRIORITY_GLYPH,
  PRIORITY_SOFT,
  STATUS_COLOR,
  STATUS_SOFT,
  STATUS_TINT,
  avatarColors,
  icon,
  IconName,
  initials,
  labelColors,
} from './theme'

const { widget } = figma
const { AutoLayout, Text, Input, SVG, Image, Ellipse, Rectangle, useSyncedState, useSyncedMap, usePropertyMenu, useWidgetNodeId, useEffect } = widget

// ---------------------------------------------------------------------------
// Scale + small helpers
// ---------------------------------------------------------------------------
const FONT = 'Inter'

/**
 * Global UI scale. Every dimension goes through px() so the whole widget can be
 * rendered Compact / Comfortable / Large from the property menu. K is set at
 * the top of each render (rendering is synchronous).
 */
let K = 1.35
const px = (n: number) => Math.round(n * K)
const SCALES: Record<string, number> = { compact: 1, comfortable: 1.35, large: 1.7 }

/** Visible cards per column / group before a "Show more" toggle appears. */
const CARD_CAP = 10

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const toast = (msg: string) => figma.notify(msg, { timeout: 1400 })
const CHEERS = ['Nice one', 'Done and dusted', 'Shipped', 'Boom', 'That’s the way', 'Another one down', 'Clean finish', 'Crushed it', 'Good stuff', 'Onwards']
const shortName = (s: string, n = 14) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const subtasksOf = (t: Task): Subtask[] => t.subtasks ?? []
const labelsOf = (t: Task): string[] => t.labels ?? []
const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi
/** Links found in free text, trailing punctuation stripped, deduplicated, first five. */
const linksIn = (text: string): string[] => {
  const out: string[] = []
  const found = text.match(URL_RE) ?? []
  for (const raw of found) {
    const u = raw.replace(/[.,;:!?]+$/, '')
    if (u && out.indexOf(u) < 0) out.push(u)
    if (out.length === 5) break
  }
  return out
}
/** Short, readable form of a URL for a link chip: host plus the start of the path. */
const linkText = (u: string): string => {
  const m = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(u)
  if (!m) return u
  const host = m[1].replace(/^www\./, '')
  const path = m[2] && m[2] !== '/' ? m[2] : ''
  const full = host + path
  return full.length > 40 ? full.slice(0, 39) + '…' : full
}

// ---------------------------------------------------------------------------
// Stickies → tasks
// ---------------------------------------------------------------------------
type StickyPick = { node: SceneNode; text: string; x: number; y: number; sectionName: string | null }
/** Text-bearing nodes in a selection (stickies, shapes with text, text), looking inside sections, groups and frames. Reading order: rows top to bottom, then left to right. */
function collectStickies(nodes: readonly SceneNode[]): StickyPick[] {
  const out: StickyPick[] = []
  const visit = (n: SceneNode, depth: number) => {
    let text = ''
    if (n.type === 'STICKY' || n.type === 'SHAPE_WITH_TEXT') text = n.text.characters
    else if (n.type === 'TEXT') text = n.characters
    else if (depth < 4 && 'children' in n) {
      for (const c of n.children) visit(c, depth + 1)
      return
    }
    text = text.trim()
    if (!text) return
    const box = n.absoluteBoundingBox
    const parent = n.parent
    out.push({ node: n, text, x: box ? box.x : n.x, y: box ? box.y : n.y, sectionName: parent && parent.type === 'SECTION' ? parent.name : null })
  }
  for (const n of nodes) visit(n, 0)
  out.sort((a, b) => {
    const ra = Math.round(a.y / 60)
    const rb = Math.round(b.y / 60)
    return ra !== rb ? ra - rb : a.x - b.x
  })
  return out
}
const firstLine = (s: string): string => s.split('\n')[0].trim()
const restLines = (s: string): string => s.split('\n').slice(1).join('\n').trim()
/** Everyone assigned: the owner (first) plus co-assignees, deduplicated. */
const assigneesOf = (t: Task): string[] => {
  const out: string[] = t.assignee ? [t.assignee] : []
  for (const n of t.coassignees ?? []) if (n && out.indexOf(n) < 0) out.push(n)
  return out
}
const isAssigned = (t: Task, name: string): boolean => assigneesOf(t).indexOf(name) >= 0
const hoursOf = (t: Task, person: string, key: string): number => (t.hours && t.hours[person] && t.hours[person][key]) || 0
const fmtHours = (h: number): string => (Math.round(h * 100) / 100).toString()
const hexToRgb = (hex: string): RGB => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 })

// ---------------------------------------------------------------------------
// Primitives. Design rule: every node is a real Figma sublayer, so a component
// renders the fewest nodes that still look right. No SVG below the header, no
// drop shadows anywhere, no clipping, hover only on real buttons.
// ---------------------------------------------------------------------------
function Icon({ name, color, size = 12 }: { name: IconName; color: string; size?: number }) {
  const sz = px(size)
  return <SVG src={icon(name, color, sz)} width={sz} height={sz} />
}

type Click = (() => void | Promise<void>) | undefined

/**
 * Status glyph drawn with frames; the frame itself can be the button, so a
 * selector option costs 1–2 nodes instead of 3.
 */
function StatusGlyph(props: { status: Status; size?: number; color?: string; muted?: boolean; onClick?: Click; hoverFill?: string; fill?: string; tooltip?: string }) {
  const { status } = props
  const c = props.color ?? (props.muted ? C.faint : STATUS_COLOR[status])
  const sz = px(props.size ?? 12)
  const r = sz / 2
  if (status === 'done') {
    return (
      <AutoLayout width={sz} height={sz} cornerRadius={r} fill={c} horizontalAlignItems="center" verticalAlignItems="center" onClick={props.onClick} tooltip={props.tooltip} hoverStyle={props.hoverFill ? { fill: props.hoverFill } : undefined}>
        <Text fontFamily={FONT} fontSize={Math.round(sz * 0.66)} fontWeight={700} fill="#FFFFFF" lineHeight={sz}>
          ✓
        </Text>
      </AutoLayout>
    )
  }
  return (
    <AutoLayout
      width={sz}
      height={sz}
      cornerRadius={r}
      fill={props.fill}
      stroke={c}
      strokeWidth={props.fill ? 2 : 1.5}
      strokeDashPattern={status === 'todo' ? [px(2), px(2)] : undefined}
      horizontalAlignItems="center"
      verticalAlignItems="center"
      onClick={props.onClick}
      tooltip={props.tooltip}
      hoverStyle={props.hoverFill ? { fill: props.hoverFill } : undefined}
    >
      {status === 'inprogress' ? (
        <Ellipse width={sz - px(5)} height={sz - px(5)} fill={c} arcData={{ startingAngle: -Math.PI / 2, endingAngle: Math.PI / 2, innerRadius: 0 }} />
      ) : status === 'blocked' ? (
        <Rectangle width={Math.round(sz * 0.45)} height={px(1.5)} fill={c} />
      ) : null}
    </AutoLayout>
  )
}

/** Profile photo when Figma gave us one, initials otherwise, "?" when unassigned. */
function Avatar({ name, photo, size = 18, onClick, tooltip }: { name: string; photo?: string | null; size?: number; onClick?: Click; tooltip?: string }) {
  const sz = px(size)
  if (!name) {
    return (
      <AutoLayout width={sz} height={sz} cornerRadius={sz / 2} fill={C.surface} stroke={C.borderStrong} horizontalAlignItems="center" verticalAlignItems="center" onClick={onClick} tooltip={tooltip}>
        <Text fontFamily={FONT} fontSize={Math.round(sz * 0.5)} fontWeight={600} fill={C.faint} lineHeight={sz}>
          ?
        </Text>
      </AutoLayout>
    )
  }
  if (photo) {
    return <Image src={photo} width={sz} height={sz} cornerRadius={sz / 2} onClick={onClick} tooltip={tooltip} />
  }
  const [bg, fg] = avatarColors(name)
  return (
    <AutoLayout width={sz} height={sz} cornerRadius={sz / 2} fill={bg} horizontalAlignItems="center" verticalAlignItems="center" onClick={onClick} tooltip={tooltip}>
      <Text fontFamily={FONT} fontSize={Math.round(sz * 0.44)} fontWeight={700} fill={fg} lineHeight={sz} letterSpacing={0.2}>
        {initials(name)}
      </Text>
    </AutoLayout>
  )
}

/** Text with the click/hover/tooltip pass-through, so a clickable label is one node. */
function Label(props: {
  children: string
  size?: number
  color?: string
  weight?: 400 | 500 | 600 | 700
  width?: 'fill-parent' | 'hug-contents' | number
  truncate?: boolean | number
  strike?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  onClick?: Click
  hover?: string
  tooltip?: string
  /** Makes the text a clickable link (opens in the browser). */
  href?: string
  underline?: boolean
}) {
  const size = px(props.size ?? 11)
  const link = props.href ? { href: props.href } : {}
  return (
    <Text
      {...(link as Record<string, never>)}
      fontFamily={FONT}
      fontSize={size}
      fontWeight={props.weight ?? 400}
      fill={props.color ?? C.text}
      width={typeof props.width === 'number' ? px(props.width) : props.width ?? 'hug-contents'}
      truncate={props.truncate}
      textDecoration={props.strike ? 'strikethrough' : props.underline ? 'underline' : 'none'}
      italic={props.italic}
      horizontalAlignText={props.align ?? 'left'}
      lineHeight={Math.round(size * 1.35)}
      onClick={props.onClick}
      hoverStyle={props.hover ? { fill: props.hover } : undefined}
      tooltip={props.tooltip}
    >
      {props.children}
    </Text>
  )
}

/** Button. Labelled buttons render no icon (keeps SVG parsing out of the common path). */
function Btn(props: { label?: string; icon?: IconName; onClick: Click; tone?: 'default' | 'primary' | 'ghost' | 'danger' | 'dangerGhost'; tooltip?: string; small?: boolean }) {
  const tone = props.tone ?? 'default'
  const fill = tone === 'primary' ? C.accent : tone === 'ghost' || tone === 'dangerGhost' ? undefined : tone === 'danger' ? C.dangerSoft : C.bg
  const color = tone === 'primary' ? '#FFFFFF' : tone === 'danger' || tone === 'dangerGhost' ? C.danger : tone === 'ghost' ? C.muted : C.text
  const hover = tone === 'primary' ? C.accentHover : tone === 'danger' ? '#FECACA' : tone === 'dangerGhost' ? C.dangerSoft : C.surfaceAlt
  const pad = props.small ? { vertical: px(3), horizontal: px(7) } : { vertical: px(6), horizontal: px(10) }
  return (
    <AutoLayout direction="horizontal" padding={pad} cornerRadius={px(8)} fill={fill} stroke={tone === 'default' ? C.border : undefined} strokeWidth={1} verticalAlignItems="center" onClick={props.onClick} hoverStyle={{ fill: hover }} tooltip={props.tooltip}>
      {props.label ? (
        <Label size={props.small ? 10 : 11} weight={600} color={color}>
          {props.label}
        </Label>
      ) : props.icon ? (
        <Icon name={props.icon} color={color} size={props.small ? 11 : 12} />
      ) : null}
    </AutoLayout>
  )
}

/** Square text-glyph button: "×", "−", "+", "›". One frame + one text, no SVG. */
function GlyphBtn({ glyph, onClick, tooltip, size = 20, color }: { glyph: string; onClick: Click; tooltip?: string; size?: number; color?: string }) {
  const s = px(size)
  return (
    <AutoLayout width={s} height={s} cornerRadius={px(6)} horizontalAlignItems="center" verticalAlignItems="center" onClick={onClick} hoverStyle={{ fill: C.surfaceAlt }} tooltip={tooltip}>
      <Text fontFamily={FONT} fontSize={Math.round(s * (glyph === '›' || glyph === '⌃' ? 0.95 : 0.7))} fontWeight={700} fill={color ?? C.muted} lineHeight={glyph === '⌃' ? Math.round(s * 1.35) : s}>
        {glyph}
      </Text>
    </AutoLayout>
  )
}

function IconBtn(props: { icon: IconName; onClick: Click; tooltip?: string; color?: string; size?: number }) {
  const s = px(props.size ?? 20)
  return (
    <AutoLayout width={s} height={s} cornerRadius={px(6)} horizontalAlignItems="center" verticalAlignItems="center" onClick={props.onClick} hoverStyle={{ fill: C.surfaceAlt }} tooltip={props.tooltip}>
      <Icon name={props.icon} color={props.color ?? C.muted} size={Math.round((props.size ?? 20) * 0.6)} />
    </AutoLayout>
  )
}

/** Toggle chip (filters, option rows). */
function Chip(props: { label: string; active?: boolean; onClick: Click; color?: string; soft?: string; tooltip?: string; dashed?: boolean; small?: boolean }) {
  const active = !!props.active
  const color = props.color ?? C.accent
  const soft = props.soft ?? C.accentSoft
  return (
    <AutoLayout
      padding={props.small ? { vertical: px(2), horizontal: px(7) } : { vertical: px(3), horizontal: px(8) }}
      cornerRadius={px(999)}
      fill={active ? soft : C.bg}
      stroke={active ? color : C.border}
      strokeWidth={1}
      strokeDashPattern={props.dashed && !active ? [3, 2] : undefined}
      verticalAlignItems="center"
      onClick={props.onClick}
      hoverStyle={{ fill: active ? soft : C.surface, stroke: color }}
      tooltip={props.tooltip}
    >
      <Label size={10} weight={600} color={active ? color : C.muted}>
        {props.label}
      </Label>
    </AutoLayout>
  )
}

/** Filled count/status pill — header and column chrome only (cards use plain text). */
function Pill({ text, color, fill, size = 9, onClick, tooltip, solid }: { text: string; color: string; fill?: string; size?: number; onClick?: Click; tooltip?: string; solid?: boolean }) {
  return (
    <AutoLayout padding={{ vertical: px(1), horizontal: px(6) }} cornerRadius={px(999)} fill={solid ? color : fill ?? C.surface} verticalAlignItems="center" onClick={onClick} tooltip={tooltip}>
      <Label size={size} weight={700} color={solid ? '#FFFFFF' : color}>
        {text}
      </Label>
    </AutoLayout>
  )
}

function LabelPill({ name, size = 9, onClick, active = true, quiet }: { name: string; size?: number; onClick?: Click; active?: boolean; quiet?: boolean }) {
  const [bg, fg] = labelColors(name)
  return (
    <AutoLayout
      padding={{ vertical: px(1), horizontal: px(6) }}
      cornerRadius={px(4)}
      fill={active ? bg : C.bg}
      stroke={active ? undefined : C.border}
      verticalAlignItems="center"
      onClick={onClick}
      hoverStyle={onClick && !quiet ? { fill: bg, stroke: fg } : undefined}
    >
      <Label size={size} weight={700} color={active ? fg : C.muted}>
        {name}
      </Label>
    </AutoLayout>
  )
}

function Divider() {
  return <Rectangle width="fill-parent" height={1} fill={C.border} />
}

function Progress({ done, total, width, onClick, tooltip }: { done: number; total: number; width: number; onClick?: Click; tooltip?: string }) {
  const pct = total ? done / total : 0
  const w = px(width)
  return (
    <AutoLayout width={w} height={px(4)} cornerRadius={px(2)} fill={C.surfaceAlt} onClick={onClick} tooltip={tooltip}>
      {pct > 0 ? <Rectangle width={Math.max(px(4), Math.round(w * pct))} height={px(4)} cornerRadius={px(2)} fill={pct >= 1 ? C.success : C.accent} /> : null}
    </AutoLayout>
  )
}

// ---------------------------------------------------------------------------
// Date picker (iframe) – the only part that needs an iframe UI
// ---------------------------------------------------------------------------
function pickDate(title: string, current: string | null, onPick: (iso: string | null) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    figma.showUI(__html__, { width: 320, height: 236, title: 'Due date' })
    figma.ui.postMessage({ type: 'init', title, value: current, today: todayISO() })
    figma.ui.onmessage = (msg: { type: string; value?: string | null }) => {
      if (msg && msg.type === 'set') onPick(msg.value ?? null)
      figma.closePlugin()
      resolve()
    }
  })
}

// ---------------------------------------------------------------------------
// Shared store: document-level plugin data, visible to every board in the file
// ---------------------------------------------------------------------------
// Figma requires an alphanumeric namespace for shared plugin data.
const NS = 'kanbanlite'
/** Every useSyncedState key this widget uses — preserved when pushing state into another instance. */
const STATE_KEYS = [
  'view',
  'collapsed2',
  'showAll',
  'openId',
  'freshId',
  'confirmDeleteId',
  'confirmRemoveId',
  'hoursPeriod',
  'hoursSubmitted',
  'filters',
  'filtersOpen',
  'search',
  'sort',
  'showArchived',
  'doneSearch',
  'staleDays',
  'boardTitle',
  'uiSize',
  'scope',
  'storeVersion',
  'lastSyncedVersion',
  'liveSync',
  'celebrate',
]
function storeRead<T>(key: string): T | null {
  const raw = figma.root.getSharedPluginData(NS, key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch (_) {
    return null
  }
}
/** A single version stamp lets a render decide in one API call whether a full merge is needed. */
const readStoreVersion = (): number => {
  const raw = figma.root.getSharedPluginData(NS, 'version')
  const n = raw ? parseInt(raw, 10) : 0
  return isNaN(n) ? 0 : n
}
let storeErrorShown = false
const storeWrite = (key: string, value: unknown | null) => {
  try {
    figma.root.setSharedPluginData(NS, key, value === null ? '' : JSON.stringify(value))
  } catch (e) {
    if (!storeErrorShown) {
      storeErrorShown = true
      figma.notify('Could not sync to the other boards: ' + String(e), { timeout: 4000, error: true })
    }
  }
}

/**
 * Per-interaction commit scratch. The sandbox lives for exactly one interaction,
 * so module variables are a safe place to collect "what changed" and flush it
 * once at the end of a handler (one version bump, one push) instead of N times.
 */
let dirty = false
let touched: Set<string> | null = new Set<string>()
const markTouched = (...names: Array<string | undefined | null>) => {
  if (!touched) return
  for (const n of names) if (n) touched.add(n)
}

// ---------------------------------------------------------------------------
// CSV export – builds the file in the sandbox, hands it to the iframe to save
// ---------------------------------------------------------------------------
const csvCell = (v: string | number | boolean | null | undefined): string => {
  const str = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
}
const isoDateTime = (ts: number | null) => (ts ? new Date(ts).toISOString() : '')

/** "Jon Park 2026-W42=6; Jon Park 2026-10=20" */
const hoursText = (t: Task): string => {
  const parts: string[] = []
  const h = t.hours || {}
  for (const person of Object.keys(h)) for (const key of Object.keys(h[person])) parts.push(`${person} ${key}=${fmtHours(h[person][key])}`)
  return parts.join('; ')
}
function tasksToCsv(list: Task[]): string {
  const header = ['id', 'title', 'description', 'status', 'assignee', 'co_assignees', 'hours', 'due', 'priority', 'labels', 'subtasks_done', 'subtasks_total', 'subtasks', 'created_at', 'updated_at', 'completed_at', 'archived']
  const rows = list.map((t) => {
    const subs = subtasksOf(t)
    return [
      t.id,
      t.title,
      t.description,
      STATUS_LABEL[t.status],
      t.assignee,
      assigneesOf(t).slice(1).join('; '),
      hoursText(t),
      t.due ?? '',
      t.priority ? PRIORITY_LABEL[t.priority] : '',
      labelsOf(t).join('; '),
      subs.filter((x) => x.done).length,
      subs.length,
      subs.map((x) => `[${x.done ? 'x' : ' '}] ${x.title}`).join('; '),
      isoDateTime(t.createdAt),
      isoDateTime(t.updatedAt),
      isoDateTime(t.completedAt),
      t.archived ? 'yes' : 'no',
    ]
      .map(csvCell)
      .join(',')
  })
  return [header.join(','), ...rows].join('\r\n')
}

interface Backup {
  format: 'kanban-lite-backup'
  version: 1
  exportedAt: string
  board: string
  tasks: Task[]
  people: Person[]
}

/** Export dialog: CSV for spreadsheets, JSON backup (full fidelity) for re-import. */
function exportDialog(list: Task[], everything: Task[], peopleList: Person[], boardTitle: string): Promise<void> {
  const csv = tasksToCsv(list)
  const backup: Backup = { format: 'kanban-lite-backup', version: 1, exportedAt: new Date().toISOString(), board: boardTitle, tasks: everything, people: peopleList }
  const safe = boardTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'tasks'
  const base = `${safe}-${todayISO()}`
  return new Promise<void>((resolve) => {
    figma.showUI(__html__, { width: 440, height: 330, title: 'Export tasks' })
    figma.ui.postMessage({ type: 'export', csv, json: JSON.stringify(backup, null, 2), filename: base, count: list.length, total: everything.length })
    figma.ui.onmessage = (msg: { type: string; what?: string }) => {
      if (msg && msg.type === 'saved') toast(msg.what === 'json' ? `Backup saved · ${everything.length} tasks` : `Exported ${list.length} tasks as CSV`)
      if (msg && (msg.type === 'saved' || msg.type === 'cancel')) {
        figma.closePlugin()
        resolve()
      }
    }
  })
}

const VALID_STATUS: Record<string, true> = { todo: true, inprogress: true, blocked: true, done: true }
/** person → period key → hours; anything malformed is dropped. */
function coerceHours(raw: any): Record<string, Record<string, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, Record<string, number>> = {}
  for (const person of Object.keys(raw)) {
    const per = raw[person]
    if (!person || !per || typeof per !== 'object') continue
    for (const key of Object.keys(per)) {
      const h = per[key]
      if (typeof h === 'number' && isFinite(h) && h > 0 && /^\d{4}-(W\d{2}|\d{2})$/.test(key)) (out[person] = out[person] || {})[key] = h
    }
  }
  return Object.keys(out).length ? out : undefined
}
/** Coerce one record from a backup (or any JSON) into a Task, or null if unusable. */
function coerceTask(raw: any): Task | null {
  if (!raw || typeof raw !== 'object') return null
  const title = typeof raw.title === 'string' ? raw.title : ''
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null
  if (!id && !title.trim()) return null
  const now = Date.now()
  const num = (v: any, d: number) => (typeof v === 'number' && isFinite(v) ? v : d)
  const statusRaw = typeof raw.status === 'string' ? raw.status.toLowerCase().replace(/[^a-z]/g, '') : 'todo'
  const status = (VALID_STATUS[statusRaw] ? statusRaw : 'todo') as Status
  const prioRaw = typeof raw.priority === 'string' ? raw.priority.toLowerCase() : ''
  const priority = prioRaw === 'high' || prioRaw === 'medium' || prioRaw === 'low' ? prioRaw : null
  const assignee = typeof raw.assignee === 'string' ? raw.assignee : ''
  return {
    id: id ?? uid(),
    title,
    description: typeof raw.description === 'string' ? raw.description : '',
    status,
    assignee,
    coassignees: Array.isArray(raw.coassignees) ? raw.coassignees.filter((n: any) => typeof n === 'string' && n && n !== assignee).slice(0, 10) : [],
    hours: coerceHours(raw.hours),
    due: typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : null,
    priority,
    labels: Array.isArray(raw.labels) ? raw.labels.filter((l: any) => typeof l === 'string' && l).slice(0, 20) : [],
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks.filter((x: any) => x && typeof x.title === 'string').map((x: any) => ({ id: typeof x.id === 'string' ? x.id : uid(), title: x.title, done: !!x.done }))
      : [],
    discuss: !!raw.discuss,
    discussNote: typeof raw.discussNote === 'string' ? raw.discussNote : '',
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    completedAt: raw.completedAt === null || raw.completedAt === undefined ? (status === 'done' ? now : null) : num(raw.completedAt, now),
    archived: !!raw.archived,
  }
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------
function Widget() {
  const tasks = useSyncedMap<Task>('tasks')
  const people = useSyncedMap<Person>('people')
  const [view, setView] = useSyncedState<View>('view', 'board')
  const [collapsed, setCollapsed] = useSyncedState<Record<string, boolean>>('collapsed2', {})
  const [showAll, setShowAll] = useSyncedState<Record<string, boolean>>('showAll', {})
  const [openId, setOpenId] = useSyncedState<string | null>('openId', null)
  /** A task created with "Add task" is pinned to the top of its column until it is closed. */
  const [freshId, setFreshId] = useSyncedState<string | null>('freshId', null)
  const [confirmDeleteId, setConfirmDeleteId] = useSyncedState<string | null>('confirmDeleteId', null)
  /** On a personal board, removing yourself from a task takes two clicks; this is the task waiting for the second. */
  const [confirmRemoveId, setConfirmRemoveId] = useSyncedState<string | null>('confirmRemoveId', null)
  /** Hours tab (personal boards): which submission period is shown, and which periods were marked as submitted. */
  const [hoursPeriod, setHoursPeriod] = useSyncedState<{ kind: 'week' | 'month'; offset: number }>('hoursPeriod', { kind: 'week', offset: 0 })
  const [hoursSubmitted, setHoursSubmitted] = useSyncedState<Record<string, number>>('hoursSubmitted', {})
  const [filters, setFilters] = useSyncedState<Filters>('filters', EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useSyncedState<boolean>('filtersOpen', false)
  const [search, setSearch] = useSyncedState<string>('search', '')
  const [sort, setSort] = useSyncedState<SortMode>('sort', 'due')
  const [showArchived, setShowArchived] = useSyncedState<boolean>('showArchived', false)
  const [doneSearch, setDoneSearch] = useSyncedState<string>('doneSearch', '')
  const [staleDays, setStaleDays] = useSyncedState<number>('staleDays', 7)
  const [boardTitle, setBoardTitle] = useSyncedState<string>('boardTitle', 'Team tasks')
  const [uiSize, setUiSize] = useSyncedState<string>('uiSize', 'comfortable')
  const [scope, setScope] = useSyncedState<Scope>('scope', { kind: 'team' })
  /** Confetti popup on completion (a one-second iframe window); property-menu toggle, on by default. */
  const [celebrate, setCelebrate] = useSyncedState<boolean>('celebrate', true)
  /** Bumped by other boards on this page when they write, which re-renders this one. */
  const [storeVersion] = useSyncedState<number>('storeVersion', 0)
  /** The store version this instance has already merged; renders skip the merge while it matches. */
  const [lastSyncedVersion, setLastSyncedVersion] = useSyncedState<number>('lastSyncedVersion', -1)
  /** Mirror of the file-wide 'live' flag: push changes into other boards immediately. */
  const [liveSync, setLiveSync] = useSyncedState<boolean>('liveSync', false)
  const widgetId = useWidgetNodeId()
  K = SCALES[uiSize] ?? 1.35
  const owner = scope.kind === 'personal' ? scope.name : null

  const COL_W = px(300)
  const COL_GAP = px(10)
  const BOARD_W = COL_W * 4 + COL_GAP * 3
  const COLLAPSED_W = px(40)
  const CARD_W = COL_W - px(20)

  // ------------------------------------------------------------ per-render
  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  const nextWeek = addDaysISO(today, 7)
  const todayIdx = dayIndex(today)
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  /** One parse per distinct date per render instead of several per card. */
  const dueMemo = new Map<string, { diff: number; label: string; weekday: string }>()
  const dueInfo = (iso: string) => {
    let v = dueMemo.get(iso)
    if (!v) {
      const diff = dayIndex(iso) - todayIdx
      const d = parseISO(iso)
      const short = `${MONTHS[d.getMonth()]} ${d.getDate()}`
      const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : diff > 1 && diff < 7 ? `${DAYS[d.getDay()]} ${d.getDate()}` : short
      v = { diff, label, weekday: `${DAYS[d.getDay()]}, ${short}` }
      dueMemo.set(iso, v)
    }
    return v
  }
  const isLate = (t: Task) => !!t.due && t.status !== 'done' && dueInfo(t.due).diff < 0

  const photoByName: Record<string, string | null> = {}
  for (const p of people.values()) photoByName[p.name] = p.photoUrl
  const photoOf = (name: string): string | null => (name ? photoByName[name] ?? null : null)

  const everything = tasks.values()
  /** Personal boards only show tasks assigned to their owner; the store still holds everything. */
  /** The open card is kept even when it no longer matches, so it cannot vanish mid-edit; it leaves when closed. */
  const all = owner ? everything.filter((t) => isAssigned(t, owner) || t.id === openId) : everything
  const live = all.filter((t) => !t.archived)
  const active = live.filter((t) => t.status !== 'done')
  const done = live.filter((t) => t.status === 'done')
  const archived = all.filter((t) => t.archived)

  // ------------------------------------------------------------------ store
  /** Stamp the store with a new version and remember it so our own next render skips the merge. */
  const bumpStoreVersion = (): number => {
    const v = Date.now()
    try {
      figma.root.setSharedPluginData(NS, 'version', String(v))
    } catch (_) {
      return v
    }
    setLastSyncedVersion(v)
    return v
  }
  const writeTask = (t: Task) => {
    const before = tasks.get(t.id)
    tasks.set(t.id, t)
    storeWrite('task:' + t.id, t)
    markTouched(...(before ? assigneesOf(before) : []), ...assigneesOf(t))
    dirty = true
  }
  const deleteTask = (id: string) => {
    const before = tasks.get(id)
    tasks.delete(id)
    let stored = true
    try {
      stored = !!figma.root.getSharedPluginData(NS, 'task:' + id)
    } catch (_) {}
    if (stored) {
      storeWrite('task:' + id, null)
      storeWrite('deleted:' + id, { at: Date.now() })
      markTouched(...(before ? assigneesOf(before) : []))
      if (!before) touched = null
      dirty = true
    }
  }

  /**
   * Push the merged cache into every other board on this page (live mode, or
   * forced by Refresh). Setting another instance's synced state re-renders it,
   * so this is skipped for personal boards that cannot see the change.
   */
  const notifyOtherBoards = (force = false, scope: Set<string> | null = null, version?: number): number => {
    if (!liveSync && !force) return 0
    try {
      if (!figma.widgetId) return 0
      const others = figma.currentPage.findWidgetNodesByWidgetId(figma.widgetId).filter((n) => n.id !== widgetId)
      if (!others.length) return 0
      const taskMap: Record<string, Task> = {}
      const personMap: Record<string, Person> = {}
      for (const t of tasks.values()) taskMap[t.id] = t
      for (const p of people.values()) personMap[p.name] = p
      const ver = version ?? readStoreVersion()
      let pushed = 0
      for (const n of others) {
        const prev = (n.widgetSyncedState || {}) as Record<string, unknown>
        const sc = prev.scope as Scope | undefined
        if (!force && scope && sc && sc.kind === 'personal' && !scope.has(sc.name)) continue
        const next: Record<string, unknown> = {}
        for (const k of STATE_KEYS) if (k in prev) next[k] = prev[k]
        next.storeVersion = ver
        next.lastSyncedVersion = ver
        n.setWidgetSyncedState(next, { tasks: taskMap, people: personMap })
        pushed++
      }
      return pushed
    } catch (_) {
      return 0 // best effort: the other boards still merge from the store on their next render
    }
  }

  /** Flush this handler's writes: one version bump and (in live mode) one push. */
  const commit = () => {
    const wasDirty = dirty
    const scope = touched
    dirty = false
    touched = new Set<string>()
    if (!wasDirty) return
    const v = bumpStoreVersion()
    notifyOtherBoards(false, scope, v)
  }

  /**
   * Two-way merge between this instance's cache and the file store.
   * Newer updatedAt wins per task; tombstones delete; people merge by seenAt.
   */
  const syncWithStore = (): { changes: number; wrote: boolean } => {
    let changes = 0
    let wrote = false
    let keys: string[] = []
    try {
      keys = figma.root.getSharedPluginDataKeys(NS)
    } catch (_) {
      return { changes: 0, wrote: false }
    }
    const storeTasks = new Map<string, Task>()
    const tomb = new Set<string>()
    const storePeople = new Map<string, Person>()
    const live = keys.indexOf('live') >= 0 && figma.root.getSharedPluginData(NS, 'live') === '"1"'
    if (live !== liveSync) setLiveSync(live)
    const tombMax = Date.now() - 30 * 86400000
    for (const k of keys) {
      if (k.startsWith('task:')) {
        const v = storeRead<Task>(k)
        if (v && v.id) storeTasks.set(v.id, v)
      } else if (k.startsWith('deleted:')) {
        const d = storeRead<{ at: number }>(k)
        if (d && typeof d.at === 'number' && d.at < tombMax && !tasks.get(k.slice(8))) storeWrite(k, null) // prune old tombstones
        else tomb.add(k.slice(8))
      }
      else if (k.startsWith('person:')) {
        const v = storeRead<Person>(k)
        if (v && v.name) storePeople.set(v.name, v)
      }
    }
    storeTasks.forEach((st, id) => {
      const c = tasks.get(id)
      if (!c || c.updatedAt < st.updatedAt) {
        tasks.set(id, st)
        changes++
      }
    })
    for (const c of tasks.values()) {
      const st = storeTasks.get(c.id)
      if (!st) {
        if (tomb.has(c.id)) {
          tasks.delete(c.id)
          changes++
        } else {
          storeWrite('task:' + c.id, c)
          wrote = true
        }
      } else if (st.updatedAt < c.updatedAt) {
        storeWrite('task:' + c.id, c)
        wrote = true
      }
    }
    storePeople.forEach((sp, name) => {
      const c = people.get(name)
      if (!c || c.seenAt < sp.seenAt) {
        people.set(name, sp)
        changes++
      }
    })
    for (const c of people.values()) {
      const sp = storePeople.get(c.name)
      if (!sp || sp.seenAt < c.seenAt) {
        storeWrite('person:' + c.name, c)
        wrote = true
      }
    }
    return { changes, wrote }
  }
  useEffect(() => {
    // One cheap read per render; the full merge only runs when another board has written.
    let v = 0
    try {
      v = readStoreVersion()
    } catch (_) {
      return
    }
    if (v === lastSyncedVersion) return
    const r = syncWithStore()
    if (r.wrote) bumpStoreVersion()
    else setLastSyncedVersion(v)
  })

  // ------------------------------------------------------------------ people
  /** Reads currentUser/activeUsers (handler-only APIs) and records new people or photo changes. */
  const syncPeople = () => {
    const seen: Array<User | null> = [figma.currentUser, ...figma.activeUsers]
    const now = Date.now()
    for (const u of seen) {
      if (!u || !u.name) continue
      const prev = people.get(u.name)
      const photo = u.photoUrl ?? null
      if (!prev || prev.photoUrl !== photo) {
        const person: Person = { name: u.name, photoUrl: photo, seenAt: now }
        people.set(u.name, person)
        storeWrite('person:' + u.name, person)
        dirty = true
      }
    }
  }
  const myName = (): string | null => {
    syncPeople()
    commit()
    const name = figma.currentUser?.name
    if (!name) toast('Could not read your Figma name — type a name instead')
    return name ?? null
  }
  const findTeammates = () => {
    const before = people.size
    syncPeople()
    const here = figma.activeUsers.filter((u) => u.name).length
    const added = people.size - before
    toast(`${here} ${here === 1 ? 'person is' : 'people are'} in this file right now${added ? ` · ${added} new` : ''}`)
    touched = null
    commit()
  }
  /** Turn this instance into the current user's personal board. */
  const makeMine = () => {
    const u = figma.currentUser
    if (!u || !u.name) {
      toast('Could not read your Figma name')
      return
    }
    syncPeople()
    setScope({ kind: 'personal', name: u.name, photoUrl: u.photoUrl ?? null })
    if (boardTitle === 'Team tasks') setBoardTitle(`${u.name.split(/[\s|]+/)[0]}’s tasks`)
    if (view === 'people') setView('board')
    toast(`This is now ${u.name}'s board — only tasks assigned to you`)
    commit()
  }
  const makeTeam = () => {
    setScope({ kind: 'team' })
    if (view === 'hours') setView('board')
    if (/’s tasks$/.test(boardTitle)) setBoardTitle('Team tasks')
    toast('This is now the team board — every task in the file')
  }

  /** File-wide switch: live push between boards vs. manual/on-touch merge. */
  const setLive = (on: boolean) => {
    storeWrite('live', on ? '1' : null)
    setLiveSync(on)
    syncWithStore() // make this cache the full store before pushing it around
    const v = bumpStoreVersion()
    try {
      if (figma.widgetId) {
        const taskMap: Record<string, Task> = {}
        const personMap: Record<string, Person> = {}
        for (const t of tasks.values()) taskMap[t.id] = t
        for (const p of people.values()) personMap[p.name] = p
        for (const n of figma.currentPage.findWidgetNodesByWidgetId(figma.widgetId)) {
          if (n.id === widgetId) continue
          const prev = (n.widgetSyncedState || {}) as Record<string, unknown>
          const next: Record<string, unknown> = {}
          for (const k of STATE_KEYS) if (k in prev) next[k] = prev[k]
          next.liveSync = on
          next.storeVersion = v
          next.lastSyncedVersion = v
          n.setWidgetSyncedState(next, { tasks: taskMap, people: personMap })
        }
      }
    } catch (_) {}
    toast(on ? 'Live sync on — other boards update instantly (heavier)' : 'Manual sync — boards update when touched or on Refresh (lighter)')
  }

  /** Refresh: merge this board with the store, then push the result into every other board on the page. */
  const refresh = () => {
    const r = syncWithStore()
    if (r.wrote) bumpStoreVersion()
    else {
      try {
        setLastSyncedVersion(readStoreVersion())
      } catch (_) {}
    }
    const pushed = notifyOtherBoards(true)
    const pulled = r.changes ? `pulled ${r.changes} update${r.changes === 1 ? '' : 's'}` : 'nothing new here'
    toast(pushed ? `Synced: ${pulled}, updated ${pushed} other board${pushed === 1 ? '' : 's'}` : `Synced: ${pulled}`)
    dirty = false
    touched = new Set<string>()
  }

  /** Import a JSON backup (or any JSON list of tasks): newer edit wins per id, unknown ids are added. */
  const importBackup = (): Promise<void> =>
    new Promise<void>((resolve) => {
      figma.showUI(__html__, { width: 440, height: 330, title: 'Import backup' })
      figma.ui.postMessage({ type: 'import-init' })
      figma.ui.onmessage = (msg: { type: string; tasks?: unknown[]; people?: unknown[] }) => {
        if (msg && msg.type === 'import') {
          let added = 0
          let updated = 0
          let skipped = 0
          for (const raw of msg.tasks ?? []) {
            const t = coerceTask(raw)
            if (!t) {
              skipped++
              continue
            }
            const cur = tasks.get(t.id)
            if (!cur) {
              writeTask(t)
              added++
            } else if (t.updatedAt > cur.updatedAt) {
              writeTask(t)
              updated++
            } else skipped++
          }
          for (const raw of (msg.people ?? []) as any[]) {
            if (raw && typeof raw.name === 'string' && raw.name && !people.get(raw.name)) {
              const person: Person = { name: raw.name, photoUrl: typeof raw.photoUrl === 'string' ? raw.photoUrl : null, seenAt: typeof raw.seenAt === 'number' ? raw.seenAt : Date.now() }
              people.set(raw.name, person)
              storeWrite('person:' + raw.name, person)
              dirty = true
            }
          }
          touched = null
          commit()
          toast(`Imported: ${added} new, ${updated} updated, ${skipped} unchanged or skipped`)
        }
        if (msg && (msg.type === 'import' || msg.type === 'cancel')) {
          figma.closePlugin()
          resolve()
        }
      }
    })

  /** Turn the stickies selected on the canvas into tasks: one each, or one task with a subtask per sticky. */
  const importStickies = (): Promise<void> => {
    const picks = collectStickies(figma.currentPage.selection)
    if (!picks.length) {
      toast('Select stickies on this page first (drag them here from other files), then press “From stickies”')
      return Promise.resolve()
    }
    const shared = picks[0].sectionName
    const suggested = shared && picks.every((p) => p.sectionName === shared) ? shared : firstLine(picks[0].text)
    const finish = (mode: 'separate' | 'one', title: string, remove: boolean) => {
      const now = Date.now()
      let created: Task
      if (mode === 'one') {
        created = buildTask(title || suggested, { subtasks: picks.map((p, i) => ({ id: uid() + i, title: firstLine(p.text), done: false })) }, now)
        writeTask(created)
      } else {
        created = buildTask(firstLine(picks[0].text), { id: uid() + '0', description: restLines(picks[0].text) }, now)
        writeTask(created)
        picks.slice(1).forEach((p, i) => writeTask(buildTask(firstLine(p.text), { id: uid() + (i + 1), description: restLines(p.text) }, now + i + 1)))
      }
      if (remove) {
        for (const p of picks) {
          try {
            p.node.remove()
          } catch (_) {}
        }
      }
      syncPeople()
      if (view !== 'board') setView('board')
      if (collapsed.todo) setCollapsed({ ...collapsed, todo: false })
      if (mode === 'one' || picks.length === 1) setOpenId(created.id)
      commit()
      toast(mode === 'one' ? `Added “${created.title}” with ${picks.length} subtasks` : picks.length === 1 ? `Added “${created.title}”` : `Added ${picks.length} tasks from stickies`)
    }
    if (picks.length === 1) {
      finish('separate', '', false)
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      figma.showUI(__html__, { width: 440, height: 372, title: 'Stickies → tasks' })
      figma.ui.postMessage({ type: 'stickies-init', count: picks.length, titles: picks.slice(0, 8).map((p) => firstLine(p.text)), suggested })
      figma.ui.onmessage = (msg: { type: string; mode?: string; title?: string; remove?: boolean }) => {
        if (msg && msg.type === 'stickies') finish(msg.mode === 'one' ? 'one' : 'separate', (msg.title ?? '').trim(), !!msg.remove)
        if (msg && (msg.type === 'stickies' || msg.type === 'cancel')) {
          figma.closePlugin()
          resolve()
        }
      }
    })
  }

  // ------------------------------------------------------------- mutations
  const patch = (id: string, p: Partial<Task>) => {
    const t = tasks.get(id)
    if (!t) return
    const next = { ...t, ...p, updatedAt: Date.now() }
    writeTask(next)
    if (owner && isAssigned(t, owner) && !isAssigned(next, owner)) {
      const names = assigneesOf(next)
      toast(names.length ? `Now on ${names[0]}'s board — this card stays until you close it` : 'Unassigned — only on the team board now; this card stays until you close it')
    }
    commit()
  }
  const patchMany = (ids: string[], p: Partial<Task>) => {
    for (const id of ids) {
      const t = tasks.get(id)
      if (t) writeTask({ ...t, ...p, updatedAt: Date.now() })
    }
    commit()
  }

  /** Replace the whole assignee list; the first name is the owner, the rest co-assignees. */
  const setAssignees = (id: string, names: string[]) => {
    const clean: string[] = []
    for (const n of names) if (n && clean.indexOf(n) < 0) clean.push(n)
    patch(id, { assignee: clean[0] ?? '', coassignees: clean.slice(1) })
  }
  const toggleAssignee = (id: string, name: string) => {
    const t = tasks.get(id)
    if (!t || !name) return
    const names = assigneesOf(t)
    setAssignees(id, names.indexOf(name) >= 0 ? names.filter((n) => n !== name) : names.concat(name))
  }
  /** Same as toggleAssignee, but on your own board taking yourself off needs a second click. */
  const toggleAssigneeGuarded = (id: string, name: string) => {
    const t = tasks.get(id)
    if (!t || !name) return
    if (owner && name === owner && isAssigned(t, name)) {
      if (confirmRemoveId !== id) {
        setConfirmRemoveId(id)
        toast('Click again to take yourself off this task')
        return
      }
      setConfirmRemoveId(null)
    }
    toggleAssignee(id, name)
  }
  /** Hours for one person and one submission period; 0 clears the entry. */
  const setTaskHours = (id: string, person: string, key: string, h: number) => {
    const t = tasks.get(id)
    if (!t) return
    const all: Record<string, Record<string, number>> = {}
    for (const p of Object.keys(t.hours || {})) all[p] = { ...(t.hours as Record<string, Record<string, number>>)[p] }
    const mine = { ...(all[person] || {}) }
    if (h > 0) mine[key] = Math.min(999, Math.round(h * 100) / 100)
    else delete mine[key]
    if (Object.keys(mine).length) all[person] = mine
    else delete all[person]
    patch(id, { hours: Object.keys(all).length ? all : undefined })
  }
  const addAssignee = (id: string, name: string) => {
    const t = tasks.get(id)
    if (!t || !name || isAssigned(t, name)) return
    setAssignees(id, assigneesOf(t).concat(name))
  }

  /** A new task with this board's defaults (owner on a personal board), not yet written. */
  const buildTask = (title: string, extra: Partial<Task> = {}, now = Date.now()): Task => {
    const t: Task = {
      id: uid(),
      title: title.trim(),
      description: '',
      status: 'todo',
      assignee: '',
      due: null,
      priority: null,
      labels: [],
      subtasks: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archived: false,
      ...extra,
    }
    if (owner && !t.assignee) t.assignee = owner
    if (t.status === 'done') t.completedAt = now
    return t
  }
  const createTask = (title: string, extra: Partial<Task> = {}, allowEmpty = false): string | null => {
    const clean = title.trim()
    if (!clean && !allowEmpty) return null
    const t = buildTask(clean, extra)
    if (!clean && allowEmpty) {
      tasks.set(t.id, t) // blank card: local only until it gets content (patch writes it to the store)
      return t.id
    }
    writeTask(t)
    syncPeople()
    commit()
    return t.id
  }

  /** "Add task": a blank card at the top of To Do, already open for editing. */
  /** A card is blank only if the user has done nothing with it at all (title, fields, status, owner, completion). */
  const isBlank = (t: Task) =>
    !t.title.trim() && !t.description && !t.due && !t.priority && !labelsOf(t).length && !subtasksOf(t).length && !t.discuss && t.status === 'todo' && !t.completedAt && t.assignee === (owner ?? '') && !(t.coassignees ?? []).length
  const discardIfBlank = (id: string | null) => {
    if (!id) return
    const t = tasks.get(id)
    if (t && isBlank(t)) deleteTask(id)
    if (freshId === id) setFreshId(null)
  }
  const openCard = (id: string) => {
    if (freshId && freshId !== id) discardIfBlank(freshId)
    setOpenId(id)
    if (confirmRemoveId) setConfirmRemoveId(null)
    const t = tasks.get(id)
    if (people.size === 0 || (t && assigneesOf(t).some((n) => !photoOf(n)))) syncPeople() // only when it can add a photo
    commit()
  }
  const closeCard = () => {
    if (openId && openId === freshId) {
      const t = tasks.get(openId)
      if (t && !isBlank(t) && t.title.trim()) toast(`Added “${shortName(t.title, 34)}”`)
      discardIfBlank(openId)
    }
    setOpenId(null)
    if (confirmRemoveId) setConfirmRemoveId(null)
    commit()
  }
  /** "Add task": reuse an existing blank card (fresh, or an orphan) rather than stacking another; the map is live, so this holds for a double click too. */
  const addTask = () => {
    let id: string | null = null
    const f = freshId ? tasks.get(freshId) : undefined
    if (f && isBlank(f)) id = f.id
    else {
      for (const t of tasks.values()) {
        if (!t.archived && isBlank(t)) {
          id = t.id
          break
        }
      }
    }
    if (freshId && freshId !== id) discardIfBlank(freshId)
    if (!id) id = createTask('', { status: 'todo' }, true)
    if (!id) return
    setFreshId(id)
    setOpenId(id)
    if (collapsed.todo) setCollapsed({ ...collapsed, todo: false })
    if (view !== 'board') setView('board')
    if (anyFilter) toast('Filters cleared so the new card is visible')
    if (anyFilter) clearFilters()
  }

  const complete = (id: string): Promise<void> | void => {
    const t = tasks.get(id)
    if (!t || t.status === 'done') return
    if (id === freshId && !t.title.trim()) {
      toast('Give the task a title first')
      return
    }
    if (id === freshId) setFreshId(null)
    const now = Date.now()
    patch(id, { status: 'done', completedAt: now })
    if (openId === id) setOpenId(null)
    const msg = cheerFor(t, now)
    figma.notify(msg, { timeout: 2400 })
    if (celebrate) return confettiPopup(msg)
  }
  /** A one-second confetti burst in the widget's iframe window, which closes itself. */
  const confettiPopup = (message: string): Promise<void> =>
    new Promise<void>((resolve) => {
      figma.showUI(__html__, { width: 320, height: 200, title: 'Done!' })
      figma.ui.postMessage({ type: 'confetti-init', message, ms: 1300 })
      figma.ui.onmessage = () => {
        figma.closePlugin()
        resolve()
      }
    })
  /** A short, personal completion message; milestones first, then a rotating cheer with today's count. */
  const cheerFor = (t: Task, now: number): string => {
    let first = ''
    try {
      first = (figma.currentUser?.name ?? '').split(' ')[0]
    } catch (_) {}
    const you = first ? `, ${first}` : ''
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const todayCount = all.filter((x) => x.id !== t.id && x.status === 'done' && x.completedAt && x.completedAt >= dayStart.getTime()).length + 1
    const me = first ? assigneesOf(t).find((n) => n.split(' ')[0] === first) : undefined
    const mineLeft = me ? active.filter((x) => x.id !== t.id && isAssigned(x, me)).length : -1
    if (mineLeft === 0) return `🏆 Your board is clear${you}. Nothing left to do.`
    if (t.status === 'blocked' && active.filter((x) => x.id !== t.id && x.status === 'blocked').length === 0) return `🔓 Blocked is empty — nothing in the way${you}.`
    if (todayCount === 1) return `☀️ First one done today — good start${you}.`
    if (todayCount % 10 === 0) return `🔥 ${todayCount} done today — on a roll.`
    const cheer = CHEERS[(t.id.charCodeAt(t.id.length - 1) + todayCount) % CHEERS.length]
    return `${cheer}${you} ✓ ${todayCount} done today`
  }
  const setStatus = (id: string, status: Status) => {
    const t = tasks.get(id)
    if (!t || t.status === status) return
    if (status === 'done') return complete(id)
    patch(id, { status, completedAt: null })
  }
  const reopen = (id: string) => patch(id, { status: 'todo', completedAt: null, archived: false })
  const archive = (id: string, flag: boolean) => {
    patch(id, { archived: flag })
    toast(flag ? 'Archived' : 'Restored')
  }
  const remove = (id: string) => {
    deleteTask(id)
    setConfirmDeleteId(null)
    if (openId === id) setOpenId(null)
    if (freshId === id) setFreshId(null)
    toast('Task deleted')
    commit()
  }
  const setDue = (id: string, due: string | null) => patch(id, { due })
  const setDiscuss = (id: string, flag: boolean) => patch(id, { discuss: flag })
  const toggleLabel = (id: string, label: string) => {
    const t = tasks.get(id)
    if (!t) return
    const cur = labelsOf(t)
    patch(id, { labels: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] })
  }
  const addSubtask = (id: string, title: string) => {
    const clean = title.trim()
    const t = tasks.get(id)
    if (!t || !clean) return
    patch(id, { subtasks: [...subtasksOf(t), { id: uid(), title: clean, done: false }] })
  }
  const patchSubtask = (id: string, sid: string, p: Partial<Subtask> | null) => {
    const t = tasks.get(id)
    if (!t) return
    const next = p === null ? subtasksOf(t).filter((s) => s.id !== sid) : subtasksOf(t).map((s) => (s.id === sid ? { ...s, ...p } : s))
    patch(id, { subtasks: next })
  }

  /**
   * Creates a dated section with one sticky per flagged task, placed to the
   * right of the widget on the current FigJam page.
   */
  const createAgendaOnCanvas = async () => {
    const flagged = live.filter((t) => t.discuss)
    if (!flagged.length) {
      toast('Flag tasks with “Discuss in team sync” first')
      return
    }
    const me = await figma.getNodeByIdAsync(widgetId)
    const anchor = me && 'absoluteBoundingBox' in me ? (me as SceneNode).absoluteBoundingBox : null
    const section = figma.createSection()
    section.name = `Team sync · ${weekdayDate(today)}`
    section.fills = [{ type: 'SOLID', color: hexToRgb('#EEF2FF') }]
    const gap = 24
    const cols = 3
    let w = 0
    let h = 0
    const stickies = flagged.map(() => figma.createSticky())
    const fontName = stickies[0].text.fontName
    await figma.loadFontAsync(fontName as FontName)
    flagged.forEach((t, i) => {
      const sticky = stickies[i]
      const lines = [t.title || 'Untitled']
      const meta = [assigneesOf(t).length ? assigneesOf(t).map((n) => `@${n}`).join(' ') : 'Unassigned', STATUS_LABEL[t.status], t.due ? `due ${dueInfo(t.due).label}` : null].filter(Boolean).join(' · ')
      lines.push('', meta)
      if (t.discussNote) lines.push('', t.discussNote)
      sticky.text.characters = lines.join('\n')
      sticky.authorVisible = false
      sticky.fills = [{ type: 'SOLID', color: hexToRgb(t.status === 'blocked' ? '#FFD8B5' : t.status === 'inprogress' ? '#BFDBFE' : t.status === 'done' ? '#BBF7D0' : '#FDE68A') }]
      section.appendChild(sticky)
      const col = i % cols
      const row = Math.floor(i / cols)
      sticky.x = gap + col * (sticky.width + gap)
      sticky.y = 56 + row * (sticky.height + gap)
      w = Math.max(w, sticky.x + sticky.width + gap)
      h = Math.max(h, sticky.y + sticky.height + gap)
    })
    section.resizeWithoutConstraints(w, h)
    if (anchor) {
      section.x = anchor.x + anchor.width + 80
      section.y = anchor.y
    }
    figma.currentPage.appendChild(section)
    figma.viewport.scrollAndZoomIntoView([section])
    toast(`Created an agenda with ${flagged.length} stick${flagged.length === 1 ? 'y' : 'ies'} next to the board`)
  }

  // ---------------------------------------------------------------- filters
  const setFilter = <Key extends keyof Filters>(key: Key, value: Filters[Key]) => setFilters({ ...filters, [key]: value })
  const toggleFilter = <Key extends keyof Filters>(key: Key, value: Filters[Key]) => setFilter(key, (filters[key] === value ? (key === 'stale' ? false : null) : value) as Filters[Key])
  const activeFilterCount = (filters.assignee ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.due ? 1 : 0) + (filters.status ? 1 : 0) + (filters.stale ? 1 : 0) + (filters.label ? 1 : 0)
  const anyFilter = activeFilterCount > 0 || search.trim().length > 0
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setSearch('')
  }
  const isStale = (t: Task) => t.status === 'todo' && ageInDays(t.createdAt) >= staleDays

  const q = search.trim().toLowerCase()
  const matches = (t: Task): boolean => {
    if (t.id === freshId || t.id === openId) return true
    if (q) {
      const hay = `${t.title} ${t.description} ${assigneesOf(t).join(' ')} ${labelsOf(t).join(' ')} ${subtasksOf(t).map((s) => s.title).join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.assignee === '__none__' && assigneesOf(t).length) return false
    if (filters.assignee && filters.assignee !== '__none__' && !isAssigned(t, filters.assignee)) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.status && t.status !== filters.status) return false
    if (filters.stale && !isStale(t)) return false
    if (filters.label && !labelsOf(t).includes(filters.label)) return false
    if (filters.due) {
      if (filters.due === 'none' && t.due) return false
      if (filters.due !== 'none' && !t.due) return false
      if (filters.due === 'overdue' && !isLate(t)) return false
      if (filters.due === 'today' && t.due !== today) return false
      if (filters.due === 'week' && t.due) {
        const d = dueInfo(t.due).diff
        if (d < 0 || d > 6) return false
      }
    }
    return true
  }

  const compare = (a: Task, b: Task): number => {
    if (sort === 'created') return b.createdAt - a.createdAt
    if (sort === 'priority') {
      const pr = PRIORITY_RANK[a.priority ?? 'none'] - PRIORITY_RANK[b.priority ?? 'none']
      if (pr !== 0) return pr
    }
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
    if (a.due && !b.due) return -1
    if (!a.due && b.due) return 1
    const pr = PRIORITY_RANK[a.priority ?? 'none'] - PRIORITY_RANK[b.priority ?? 'none']
    if (pr !== 0) return pr
    return a.createdAt - b.createdAt
  }
  /** The card created with "Add task" stays on top of its column while it is fresh. */
  const sortTasks = (list: Task[]) => {
    const sorted = list.slice().sort(compare)
    if (!freshId) return sorted
    const i = sorted.findIndex((t) => t.id === freshId)
    if (i > 0) {
      const [f] = sorted.splice(i, 1)
      sorted.unshift(f)
    }
    return sorted
  }

  const knownAssignees = Array.from(new Set([...([] as string[]).concat(...live.map(assigneesOf)), ...Object.keys(photoByName)])).sort()
  const knownLabels: string[] = Array.from(new Set(live.reduce<string[]>((acc, t) => acc.concat(labelsOf(t)), []))).sort()
  const overdueCount = active.filter(isLate).length
  const blockedCount = active.filter((t) => t.status === 'blocked').length
  const unassignedCount = active.filter((t) => assigneesOf(t).length === 0).length
  const dayStartMs = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })()
  const doneToday = all.filter((t) => t.status === 'done' && t.completedAt && t.completedAt >= dayStartMs).length
  /** Today's completions as a ring: the arc is the share of today's work (done today + still active) that is done. */
  function TodayRing() {
    const sz = px(20)
    const frac = Math.min(1, doneToday / (doneToday + active.length))
    const full = frac >= 0.999
    return (
      <AutoLayout direction="horizontal" spacing={px(5)} verticalAlignItems="center" onClick={() => setView('done')}>
        <AutoLayout width={sz} height={sz} horizontalAlignItems="center" verticalAlignItems="center">
          <Ellipse width={sz} height={sz} fill={C.successSoft} arcData={{ startingAngle: 0, endingAngle: Math.PI * 2, innerRadius: 0.74 }} positioning="absolute" x={0} y={0} />
          <Ellipse width={sz} height={sz} fill={C.success} arcData={{ startingAngle: -Math.PI / 2, endingAngle: full ? Math.PI * 1.5 : -Math.PI / 2 + Math.PI * 2 * frac, innerRadius: 0.74 }} positioning="absolute" x={0} y={0} />
          <Text fontFamily={FONT} fontSize={px(doneToday > 9 ? 7 : 9)} fontWeight={700} fill={C.success} lineHeight={sz}>
            {String(doneToday)}
          </Text>
        </AutoLayout>
        <Label size={10} weight={600} color={C.success}>
          done today
        </Label>
      </AutoLayout>
    )
  }
  const staleCount = active.filter(isStale).length
  const agendaCount = live.filter((t) => t.discuss).length

  /** Prefix-match typed text against known names so "jon" → "Jon Park". */
  const resolveAgainst = (typed: string, known: string[]): string => {
    const v = typed.trim()
    if (!v) return ''
    const lower = v.toLowerCase()
    const exact = known.find((k) => k.toLowerCase() === lower)
    if (exact) return exact
    const prefix = known.filter((k) => k.toLowerCase().startsWith(lower))
    if (prefix.length === 1) return prefix[0]
    const word = known.filter((k) => k.toLowerCase().split(/\s+/).some((w) => w.startsWith(lower)))
    if (word.length === 1) return word[0]
    return v
  }
  const resolvePerson = (typed: string) => resolveAgainst(typed, knownAssignees)
  const resolveLabel = (typed: string) => resolveAgainst(typed, knownLabels)

  // ------------------------------------------------------------ property menu
  usePropertyMenu(
    [
      {
        itemType: 'dropdown',
        propertyName: 'sort',
        tooltip: 'Sort cards',
        selectedOption: sort,
        options: [
          { option: 'due', label: 'Sort: due date' },
          { option: 'priority', label: 'Sort: priority' },
          { option: 'created', label: 'Sort: newest' },
        ],
      },
      {
        itemType: 'dropdown',
        propertyName: 'stale',
        tooltip: 'Stale threshold',
        selectedOption: String(staleDays),
        options: [
          { option: '3', label: 'Stale after 3 days' },
          { option: '7', label: 'Stale after 7 days' },
          { option: '14', label: 'Stale after 14 days' },
          { option: '30', label: 'Stale after 30 days' },
        ],
      },
      {
        itemType: 'dropdown',
        propertyName: 'size',
        tooltip: 'Widget size',
        selectedOption: uiSize,
        options: [
          { option: 'compact', label: 'Size: compact' },
          { option: 'comfortable', label: 'Size: comfortable' },
          { option: 'large', label: 'Size: large' },
        ],
      },
      { itemType: 'separator' },
      { itemType: 'toggle', propertyName: 'live', tooltip: 'Live sync between boards', isToggled: liveSync },
      { itemType: 'toggle', propertyName: 'celebrate', tooltip: 'Confetti on completion', isToggled: celebrate },
      { itemType: 'separator' },
      { itemType: 'action', propertyName: 'archiveOld', tooltip: 'Archive done > 14 days' },
    ],
    ({ propertyName, propertyValue }) => {
      switch (propertyName) {
        case 'sort':
          setSort(propertyValue as SortMode)
          break
        case 'stale':
          setStaleDays(parseInt(propertyValue as string, 10))
          break
        case 'size':
          setUiSize(propertyValue as string)
          break
        case 'live':
          setLive(!liveSync)
          break
        case 'celebrate':
          setCelebrate(!celebrate)
          toast(celebrate ? 'Confetti off' : 'Confetti on')
          break
        case 'archiveOld':
          archiveOld()
          break
        case 'samples': // not in the menu; kept for the test harness
          addSamples()
          break
      }
    },
  )

  const archiveOld = () => {
    const old = done.filter((t) => t.completedAt && ageInDays(t.completedAt) >= 14).map((t) => t.id)
    if (old.length) patchMany(old, { archived: true })
    toast(old.length ? `Archived ${old.length} completed task${old.length === 1 ? '' : 's'}` : 'Nothing older than 14 days to archive')
  }

  const addSamples = () => {
    const d = (n: number) => addDaysISO(today, n)
    const st = (titles: string[], doneCount = 0): Subtask[] => titles.map((title, i) => ({ id: uid() + i, title, done: i < doneCount }))
    const samples: Array<Partial<Task> & { title: string }> = [
      { title: 'Draft Q4 roadmap outline', status: 'todo', priority: 'high', due: d(1), assignee: 'Maya Chen', labels: ['Roadmap'], subtasks: st(['Collect team input', 'Write first draft', 'Review with leads'], 1) },
      { title: 'Review onboarding copy', status: 'todo', priority: 'medium', due: d(3), labels: ['Website'] },
      { title: 'Collect customer interview notes', status: 'todo', priority: 'low', due: d(-2), assignee: 'Jon Park', labels: ['Research'] },
      { title: 'Prototype billing settings page', status: 'inprogress', priority: 'high', due: d(0), assignee: 'Priya Nair', coassignees: ['Maya Chen'], labels: ['Billing', 'Design'], subtasks: st(['Wireframe', 'Hi-fi mockup', 'Prototype flows', 'Usability test'], 2) },
      { title: 'Update design tokens', status: 'inprogress', priority: 'medium', due: d(5), assignee: 'Maya Chen', labels: ['Design'] },
      { title: 'Waiting on legal: privacy copy', status: 'blocked', priority: 'high', due: d(-1), assignee: 'Jon Park', labels: ['Website'], description: 'Blocked until legal signs off on the new consent wording.' },
      { title: 'Ship notification preferences', status: 'done', priority: 'medium', due: d(-3), assignee: 'Priya Nair', labels: ['Billing'] },
      { title: 'Fix mobile nav overlap', status: 'done', priority: 'high', due: d(-6), assignee: 'Maya Chen', labels: ['Website'] },
    ]
    samples.forEach((s, i) => {
      const now = Date.now() - (samples.length - i) * 1000
      writeTask({
        id: uid() + i,
        title: s.title,
        description: s.description ?? '',
        status: s.status ?? 'todo',
        assignee: s.assignee ?? '',
        coassignees: s.coassignees ?? [],
        due: s.due ?? null,
        priority: s.priority ?? null,
        labels: s.labels ?? [],
        subtasks: s.subtasks ?? [],
        createdAt: now - 9 * 86400000 * (i % 2),
        updatedAt: now,
        completedAt: s.status === 'done' ? now - 2 * 86400000 : null,
        archived: false,
      })
    })
    touched = null
    commit()
    toast('Added 8 sample tasks')
  }

  // -------------------------------------------------------- shared controls
  /**
   * The one status control. Three option glyphs (To Do / In Progress / Blocked)
   * — "Done" is the check circle in row 1 — plus the current status as text
   * where there is no column to tell it (Week, People, Done view, agenda).
   */
  function StatusControl({ task, showLabel }: { task: Task; showLabel?: boolean }) {
    return (
      <AutoLayout direction="horizontal" spacing={px(3)} padding={px(2)} cornerRadius={px(999)} fill={C.surface} verticalAlignItems="center">
        {ACTIVE_STATUSES.map((s) => {
          const current = task.status === s
          return <StatusGlyph key={s} status={s} size={16} muted={!current} fill={current ? STATUS_SOFT[s] : undefined} hoverFill={current ? undefined : STATUS_SOFT[s]} onClick={() => setStatus(task.id, s)} />
        })}
        {showLabel ? (
          <AutoLayout padding={{ left: px(2), right: px(5) }}>
            <Label size={10} weight={700} color={STATUS_COLOR[task.status]}>
              {STATUS_LABEL[task.status]}
            </Label>
          </AutoLayout>
        ) : null}
      </AutoLayout>
    )
  }

  function PersonChip({ name, onClick, active, tooltip, label, danger }: { name: string; onClick: Click; active?: boolean; tooltip?: string; label?: string; danger?: boolean }) {
    const fg = danger ? C.danger : active ? C.accent : C.text
    return (
      <AutoLayout direction="horizontal" spacing={px(5)} padding={{ top: px(2), bottom: px(2), left: px(2), right: px(8) }} cornerRadius={px(999)} fill={danger ? C.dangerSoft : active ? C.accentSoft : C.bg} stroke={danger ? C.danger : active ? C.accent : C.border} verticalAlignItems="center" onClick={onClick} hoverStyle={danger ? { fill: C.dangerSoft, stroke: C.danger } : { fill: C.accentSoft, stroke: C.accent }} tooltip={tooltip}>
        <Avatar name={name} photo={photoOf(name)} size={16} />
        <Label size={10} weight={600} color={fg}>
          {label ?? shortName(name, 18)}
        </Label>
      </AutoLayout>
    )
  }

  /** Everyone assigned to a task: one avatar, or up to three overlapping ones plus a "+N". */
  function AvatarStack({ task, size = 18, onClick }: { task: Task; size?: number; onClick?: Click }) {
    const names = assigneesOf(task)
    if (names.length <= 1) return <Avatar name={names[0] ?? ''} photo={photoOf(names[0] ?? '')} size={size} onClick={onClick} tooltip={names[0] || undefined} />
    const shown = names.slice(0, 3)
    return (
      <AutoLayout direction="horizontal" spacing={px(-Math.round(size * 0.3))} verticalAlignItems="center" onClick={onClick} tooltip={names.join(', ')}>
        {shown.map((n) => (
          <Avatar key={n} name={n} photo={photoOf(n)} size={size} />
        ))}
        {names.length > shown.length ? (
          <AutoLayout padding={{ left: px(Math.round(size * 0.3) + 3) }}>
            <Label size={9} weight={700} color={C.muted}>
              {`+${names.length - shown.length}`}
            </Label>
          </AutoLayout>
        ) : null}
      </AutoLayout>
    )
  }

  // ------------------------------------------------------------------- card
  function Card({ task, width, showStatus }: { task: Task; width: number | 'fill-parent'; showStatus?: boolean }) {
    const open = openId === task.id
    const late = isLate(task)
    const stale = isStale(task)
    const isDone = task.status === 'done'
    const subs = subtasksOf(task)
    const subsDone = subs.filter((s) => s.done).length
    const labels = labelsOf(task)
    const due = task.due ? dueInfo(task.due) : null
    const openMe = () => openCard(task.id)

    return (
      <AutoLayout
        key={task.id}
        direction="vertical"
        width={width}
        spacing={px(5)}
        padding={{ vertical: px(7), horizontal: px(9) }}
        fill={C.bg}
        cornerRadius={px(8)}
        stroke={open ? C.accent : task.status === 'blocked' ? STATUS_COLOR.blocked : late ? C.danger : C.border}
        strokeWidth={open ? 2 : task.status === 'blocked' || late ? 1.5 : 1}
      >
        {/* Row 1: done circle, title, priority, close */}
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="start">
          <AutoLayout width={px(16)} height={px(16)} cornerRadius={px(4)} fill={isDone ? C.success : undefined} stroke={isDone ? undefined : C.borderStrong} strokeWidth={1.5} horizontalAlignItems="center" verticalAlignItems="center" onClick={() => complete(task.id)} hoverStyle={{ fill: isDone ? C.success : C.successSoft, stroke: C.success }}>
            {isDone ? (
              <Text fontFamily={FONT} fontSize={px(10)} fontWeight={700} fill="#FFFFFF" lineHeight={px(16)}>
                ✓
              </Text>
            ) : null}
          </AutoLayout>
          {open ? (
            <Input
              value={task.title}
              placeholder="Task title"
              onTextEditEnd={(e) => {
                const v = e.characters.trim()
                if (v !== task.title) patch(task.id, { title: v })
              }}
              fontFamily={FONT}
              fontSize={px(13)}
              fontWeight={700}
              fill={C.text}
              placeholderProps={{ fill: C.faint, fontWeight: 400 }}
              width="fill-parent"
              inputBehavior="wrap"
              inputFrameProps={{ padding: 0 }}
            />
          ) : (
            <Label size={12} weight={600} width="fill-parent" truncate={2} strike={isDone} color={isDone ? C.muted : task.title ? C.text : C.faint} italic={!task.title} onClick={openMe} hover={C.accent}>
              {task.title || 'Untitled'}
            </Label>
          )}
          {task.priority ? (
            <Label size={10} weight={700} color={PRIORITY_COLOR[task.priority]} onClick={open ? undefined : openMe}>
              {PRIORITY_GLYPH[task.priority]}
            </Label>
          ) : null}
          {open ? <GlyphBtn glyph="⌃" size={18} onClick={closeCard} /> : null}
        </AutoLayout>

        {/* Labels (closed cards; the editor lists them when open) */}
        {!open && labels.length ? (
          <AutoLayout direction="horizontal" spacing={px(4)} width="fill-parent">
            {labels.slice(0, 3).map((l) => (
              <LabelPill key={l} name={shortName(l, 14)} quiet onClick={() => setFilter('label', filters.label === l ? null : l)} />
            ))}
            {labels.length > 3 ? (
              <Label size={9} color={C.faint}>
                {`+${labels.length - 3}`}
              </Label>
            ) : null}
          </AutoLayout>
        ) : null}

        {/* Row 2: owner, due, subtasks, stale, sync, status — the single control row, also when open */}
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center" wrap>
          <AvatarStack task={task} onClick={open ? undefined : openMe} />
          {assigneesOf(task).length ? null : (
            <Label size={10} weight={500} color={C.faint} italic onClick={open ? undefined : openMe}>
              Unassigned
            </Label>
          )}
          {due ? (
            <Label size={10} weight={late || due.diff === 0 ? 700 : 500} color={late ? C.danger : due.diff === 0 ? C.accentText : C.muted} onClick={open ? undefined : openMe} tooltip={due.weekday}>
              {late ? `Overdue · ${due.label}` : due.label}
            </Label>
          ) : open ? null : (
            <Label size={10} weight={500} color={C.faint} onClick={() => setDue(task.id, today)} hover={C.accentText}>
              + date
            </Label>
          )}
          {subs.length && !open ? <Progress done={subsDone} total={subs.length} width={22} onClick={openMe} /> : null}
          {subs.length && !open ? (
            <Label size={10} weight={600} color={subsDone === subs.length ? C.success : C.muted} onClick={openMe}>
              {`${subsDone}/${subs.length}`}
            </Label>
          ) : null}
          {stale && !isDone ? (
            <Label size={10} weight={700} color={C.warn} tooltip={`${ageInDays(task.createdAt)} days in To Do`}>
              {`${ageInDays(task.createdAt)}d old`}
            </Label>
          ) : null}
          {task.discuss && !open ? (
            <Label size={10} weight={700} color={C.accentText} onClick={() => setView('sync')}>
              Sync
            </Label>
          ) : null}
          <StatusControl task={task} showLabel={showStatus} />
        </AutoLayout>

        {open ? <Editor task={task} /> : null}
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- editor
  function PropRow({ label, children, stack }: { label: string; children?: any; stack?: boolean }) {
    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={px(4)}>
        <Label size={9} weight={700} color={C.faint}>
          {label.toUpperCase()}
        </Label>
        {stack ? (
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(5)}>
            {children}
          </AutoLayout>
        ) : (
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(4)} wrap verticalAlignItems="center">
            {children}
          </AutoLayout>
        )}
      </AutoLayout>
    )
  }

  /** Expanded task body. The host decides whether it already shows a status control. */
  function Editor({ task, showStatus, inset }: { task: Task; showStatus?: boolean; inset?: boolean }) {
    const confirming = confirmDeleteId === task.id
    const customDue = !!task.due && task.due !== today && task.due !== tomorrow && task.due !== nextWeek
    const subs = subtasksOf(task)
    const subsDone = subs.filter((s) => s.done).length
    const labels = labelsOf(task)
    const late = isLate(task)
    const links = linksIn(task.description || '')
    const assigned = assigneesOf(task)
    const confirmingSelf = confirmRemoveId === task.id
    const offMyBoard = !!owner && !isAssigned(task, owner)
    const others = knownAssignees.filter((a) => assigned.indexOf(a) < 0)
    const peopleRow = assigned.concat(others.slice(0, Math.max(0, 8 - assigned.length)))
    const peopleHidden = assigned.length + others.length - peopleRow.length
    const labelsShown = knownLabels.slice(0, 12)

    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={px(10)} padding={inset ? { top: px(4), bottom: px(8), left: px(10), right: px(10) } : { top: px(4) }}>
        <Divider />
        <Input
          value={task.description || null}
          placeholder="Add a description…"
          onTextEditEnd={(e) => {
            if (e.characters !== task.description) patch(task.id, { description: e.characters })
          }}
          fontFamily={FONT}
          fontSize={px(11)}
          fill={C.text}
          placeholderProps={{ fill: C.faint }}
          width="fill-parent"
          inputBehavior="multiline"
          inputFrameProps={{ padding: { vertical: px(6), horizontal: px(8) }, fill: C.surface, cornerRadius: px(8) }}
        />
        {links.length ? (
          <AutoLayout direction="horizontal" spacing={px(6)} wrap width="fill-parent" verticalAlignItems="center">
            {links.map((u) => (
              <Label key={u} size={10} weight={600} color={C.accentText} underline href={u} hover={C.accent}>
                {`↗ ${linkText(u)}`}
              </Label>
            ))}
          </AutoLayout>
        ) : null}

        {showStatus ? (
          <PropRow label="Status">
            <StatusControl task={task} showLabel />
          </PropRow>
        ) : null}

        <PropRow label="Due">
          <Chip small label="Today" active={task.due === today} onClick={() => setDue(task.id, today)} />
          <Chip small label="Tomorrow" active={task.due === tomorrow} onClick={() => setDue(task.id, tomorrow)} />
          <Chip small label="Next week" active={task.due === nextWeek} onClick={() => setDue(task.id, nextWeek)} />
          <Chip
            small
            label={customDue ? (late ? `Overdue · ${weekdayDate(task.due as string)}` : weekdayDate(task.due as string)) : 'Pick date…'}
            active={customDue}
            color={late && customDue ? C.danger : undefined}
            soft={late && customDue ? C.dangerSoft : undefined}
            onClick={() => pickDate(task.title, task.due, (iso) => setDue(task.id, iso))}
          />
          {task.due ? (
            <Label size={10} weight={600} color={C.muted} hover={C.danger} onClick={() => setDue(task.id, null)}>
              × Clear
            </Label>
          ) : null}
        </PropRow>

        <PropRow label="Assigned to" stack>
          {offMyBoard ? (
            <AutoLayout direction="horizontal" spacing={px(6)} wrap verticalAlignItems="center" width="fill-parent" padding={{ vertical: px(4), horizontal: px(8) }} cornerRadius={px(8)} fill={C.warnSoft}>
              <Label size={10} weight={600} color={C.warn} width="fill-parent">
                Not on your board any more — it leaves when you close this card.
              </Label>
              <Label size={10} weight={700} color={C.accentText} hover={C.accent} onClick={() => addAssignee(task.id, owner as string)}>
                Add me back
              </Label>
            </AutoLayout>
          ) : null}
          <AutoLayout direction="horizontal" spacing={px(6)} verticalAlignItems="center" width="fill-parent">
            <AvatarStack task={task} size={22} />
            <Input
              value={null}
              placeholder={assigned.length ? 'Add a person…' : 'Type a name…'}
              onTextEditEnd={(e) => {
                const v = resolvePerson(e.characters)
                if (v) addAssignee(task.id, v)
              }}
              fontFamily={FONT}
              fontSize={px(11)}
              fontWeight={600}
              fill={C.text}
              placeholderProps={{ fill: C.faint, fontWeight: 400, italic: true }}
              width="fill-parent"
              inputBehavior="truncate"
              inputFrameProps={{ padding: { vertical: px(4), horizontal: px(8) }, fill: C.surface, cornerRadius: px(8) }}
            />
            <Chip
              small
              label={confirmingSelf && owner && !peopleRow.some((a) => a === owner) ? 'Remove me?' : 'Me'}
              color={confirmingSelf ? C.danger : undefined}
              soft={confirmingSelf ? C.dangerSoft : undefined}
              tooltip="Assign to me / remove me"
              onClick={() => {
                const name = myName()
                if (name) toggleAssigneeGuarded(task.id, name)
              }}
            />
            <IconBtn icon="users" tooltip="Find teammates" onClick={findTeammates} />
          </AutoLayout>
          {peopleRow.length ? (
            <AutoLayout direction="horizontal" spacing={px(4)} wrap width="fill-parent" verticalAlignItems="center">
              {peopleRow.map((a) => (
                <PersonChip key={a} name={a} active={assigned.indexOf(a) >= 0} label={confirmingSelf && a === owner ? 'Remove me?' : undefined} danger={confirmingSelf && a === owner} onClick={() => toggleAssigneeGuarded(task.id, a)} />
              ))}
              {peopleHidden > 0 ? (
                <Label size={9} color={C.faint}>
                  {`+${peopleHidden} more — type a name`}
                </Label>
              ) : null}
            </AutoLayout>
          ) : (
            <Label size={9} color={C.faint} width="fill-parent">
              Anyone you type becomes a chip here. Teammates who open this board appear automatically with their photo.
            </Label>
          )}
        </PropRow>

        <PropRow label="Priority">
          {PRIORITIES.map((p) => (
            <Chip small key={p} label={PRIORITY_GLYPH[p]} active={task.priority === p} color={PRIORITY_COLOR[p]} soft={PRIORITY_SOFT[p]} onClick={() => patch(task.id, { priority: task.priority === p ? null : p })} />
          ))}
        </PropRow>

        <PropRow label="Labels" stack>
          {labelsShown.length ? (
            <AutoLayout direction="horizontal" width="fill-parent" spacing={px(4)} wrap verticalAlignItems="center">
              {labelsShown.map((l) => (
                <LabelPill key={l} name={l} size={10} active={labels.includes(l)} onClick={() => toggleLabel(task.id, l)} />
              ))}
              {knownLabels.length > labelsShown.length ? (
                <Label size={9} color={C.faint}>
                  {`+${knownLabels.length - labelsShown.length} more — type to add`}
                </Label>
              ) : null}
            </AutoLayout>
          ) : null}
          <Input
            value={null}
            placeholder="+ Add a label, press Enter"
            onTextEditEnd={(e) => {
              const v = resolveLabel(e.characters)
              if (v && !labels.includes(v)) toggleLabel(task.id, v)
            }}
            fontFamily={FONT}
            fontSize={px(10)}
            fontWeight={600}
            fill={C.text}
            placeholderProps={{ fill: C.faint, fontWeight: 400 }}
            width="fill-parent"
            inputBehavior="truncate"
            inputFrameProps={{ padding: { vertical: px(4), horizontal: px(8) }, cornerRadius: px(6), fill: C.surface }}
          />
        </PropRow>

        <PropRow label="Team sync" stack>
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center">
            <Chip small label={task.discuss ? 'On the agenda' : 'Discuss in team sync'} active={!!task.discuss} onClick={() => setDiscuss(task.id, !task.discuss)} />
            {task.discuss ? (
              <Label size={10} weight={600} color={C.accent} onClick={() => setView('sync')} hover={C.accentHover}>
                Open agenda ›
              </Label>
            ) : null}
          </AutoLayout>
          {task.discuss ? (
            <Input
              value={task.discussNote || null}
              placeholder="What needs deciding? (shows on the agenda)"
              onTextEditEnd={(e) => {
                if (e.characters !== (task.discussNote ?? '')) patch(task.id, { discussNote: e.characters })
              }}
              fontFamily={FONT}
              fontSize={px(11)}
              fill={C.text}
              placeholderProps={{ fill: C.faint }}
              width="fill-parent"
              inputBehavior="multiline"
              inputFrameProps={{ padding: { vertical: px(5), horizontal: px(7) }, fill: C.accentSoft, cornerRadius: px(6) }}
            />
          ) : null}
        </PropRow>

        <Divider />

        {/* subtasks */}
        <AutoLayout direction="vertical" width="fill-parent" spacing={px(4)}>
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
            <Label size={10} weight={600} color={subs.length && subsDone === subs.length ? C.success : C.muted} width="fill-parent">
              {subs.length ? `Subtasks · ${subsDone}/${subs.length}` : 'Subtasks'}
            </Label>
            {subs.length ? <Progress done={subsDone} total={subs.length} width={90} /> : null}
          </AutoLayout>
          {subs.map((s) => (
            <AutoLayout key={s.id} direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center" padding={{ vertical: px(2) }}>
              <AutoLayout width={px(14)} height={px(14)} cornerRadius={px(4)} fill={s.done ? C.success : undefined} stroke={s.done ? undefined : C.borderStrong} strokeWidth={1.5} horizontalAlignItems="center" verticalAlignItems="center" onClick={() => patchSubtask(task.id, s.id, { done: !s.done })} hoverStyle={{ fill: s.done ? C.success : C.successSoft, stroke: C.success }}>
                {s.done ? (
                  <Text fontFamily={FONT} fontSize={px(9)} fontWeight={700} fill="#FFFFFF" lineHeight={px(14)}>
                    ✓
                  </Text>
                ) : null}
              </AutoLayout>
              <Input
                value={s.title}
                placeholder="Subtask"
                onTextEditEnd={(e) => {
                  const v = e.characters.trim()
                  if (!v) patchSubtask(task.id, s.id, null)
                  else if (v !== s.title) patchSubtask(task.id, s.id, { title: v })
                }}
                fontFamily={FONT}
                fontSize={px(11)}
                fill={s.done ? C.muted : C.text}
                textDecoration={s.done ? 'strikethrough' : 'none'}
                width="fill-parent"
                inputBehavior="truncate"
                inputFrameProps={{ padding: 0 }}
              />
              <Label size={13} color={C.faint} onClick={() => patchSubtask(task.id, s.id, null)} hover={C.danger}>
                ×
              </Label>
            </AutoLayout>
          ))}
          <Input
            value={null}
            placeholder="+ Add subtask"
            onTextEditEnd={(e) => addSubtask(task.id, e.characters)}
            fontFamily={FONT}
            fontSize={px(11)}
            fontWeight={500}
            fill={C.text}
            placeholderProps={{ fill: C.muted, fontWeight: 600 }}
            width="fill-parent"
            inputBehavior="wrap"
            inputFrameProps={{ padding: { vertical: px(4), horizontal: px(6) }, cornerRadius: px(6), hoverStyle: { fill: C.surface } }}
          />
        </AutoLayout>

        <Divider />

        <AutoLayout direction="horizontal" width="fill-parent" verticalAlignItems="center" spacing={px(12)}>
          <Label size={9} color={C.faint} width="fill-parent" truncate>
            {`Created ${fromTimestamp(task.createdAt)}${task.completedAt ? ` · Done ${fromTimestamp(task.completedAt)}` : ''}`}
          </Label>
          <Btn small tone="ghost" label="Archive" onClick={() => archive(task.id, true)} />
          {confirming ? <Btn small tone="danger" label="Confirm delete" onClick={() => remove(task.id)} /> : <Btn small tone="dangerGhost" label="Delete" onClick={() => setConfirmDeleteId(task.id)} />}
          <AutoLayout width={px(6)} height={px(1)} />
          <Btn small label="Close" onClick={closeCard} />
        </AutoLayout>
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- column
  function ShowMore({ keyName, total }: { keyName: string; total: number }) {
    const expanded = !!showAll[keyName]
    if (total <= CARD_CAP) return null
    return <Btn small tone="ghost" label={expanded ? 'Show less' : `Show ${total - CARD_CAP} more`} onClick={() => setShowAll({ ...showAll, [keyName]: !expanded })} />
  }
  /** First CARD_CAP cards, plus the open card if it would otherwise be hidden behind "Show more". */
  const capped = (list: Task[], keyName: string): Task[] => {
    if (showAll[keyName] || list.length <= CARD_CAP) return list
    const head = list.slice(0, CARD_CAP)
    const hidden = openId ? list.slice(CARD_CAP).find((t) => t.id === openId) : undefined
    return hidden ? head.concat(hidden) : head
  }

  function Column({ status }: { status: Status }) {
    const isCollapsed = !!collapsed[status]
    const items = live.filter((t) => t.status === status)
    // Done column: most recently completed first; other columns use the chosen sort.
    const visible = status === 'done' ? items.filter(matches).sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt)) : sortTasks(items.filter(matches))
    const color = STATUS_COLOR[status]
    const hiddenByFilter = items.length - visible.length

    if (isCollapsed) {
      return (
        <AutoLayout key={status} direction="vertical" width={COLLAPSED_W} spacing={px(8)} padding={{ vertical: px(10), horizontal: px(4) }} fill={STATUS_TINT[status]} cornerRadius={px(12)} horizontalAlignItems="center" onClick={() => setCollapsed({ ...collapsed, [status]: false })} hoverStyle={{ fill: STATUS_SOFT[status] }}>
          <Rectangle width={px(20)} height={px(3)} cornerRadius={px(2)} fill={color} />
          <StatusGlyph status={status} size={14} />
          <Pill text={String(items.length)} color={color} solid size={10} />
          <Label size={9} weight={700} color={color} align="center">
            {STATUS_SHORT[status].split('').join('\n')}
          </Label>
        </AutoLayout>
      )
    }

    const shown = capped(visible, status)
    return (
      <AutoLayout key={status} direction="vertical" width={COL_W} spacing={0} fill={STATUS_TINT[status]} cornerRadius={px(12)} overflow="hidden">
        <Rectangle width="fill-parent" height={px(4)} fill={color} />
        <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
            <StatusGlyph status={status} size={13} />
            <Label size={12} weight={700} color={C.text}>
              {STATUS_LABEL[status]}
            </Label>
            <Pill text={String(visible.length)} color={color} solid size={10} />
            {hiddenByFilter > 0 ? (
              <Label size={9} color={C.faint}>
                {`+${hiddenByFilter} filtered`}
              </Label>
            ) : null}
            <AutoLayout width="fill-parent" height={px(1)} />
            <GlyphBtn glyph="−" onClick={() => setCollapsed({ ...collapsed, [status]: true })} />
          </AutoLayout>

          {status === 'done' ? (
            <AutoLayout direction="vertical" width="fill-parent" spacing={px(4)}>
              {visible.slice(0, 5).map((t) => (
                <DoneRow key={t.id} task={t} compact />
              ))}
              {visible.length === 0 ? (
                <Label size={10} color={C.faint} italic>
                  Completed tasks land here.
                </Label>
              ) : null}
              <Btn label={visible.length > 5 ? `${visible.length - 5} more in Done view ›` : 'Open Done view ›'} tone="ghost" small onClick={() => setView('done')} />
            </AutoLayout>
          ) : (
            <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)}>
              {shown.map((t) => (
                <Card key={t.id} task={t} width="fill-parent" />
              ))}
              <ShowMore keyName={status} total={visible.length} />
              {visible.length === 0 ? (
                <Label size={10} color={C.faint} italic width="fill-parent">
                  {items.length > 0 ? 'No matches for current filters.' : status === 'todo' && live.length === 0 ? 'Type below to add your first task.' : 'Nothing here.'}
                </Label>
              ) : null}
              <Input
                value={null}
                placeholder="+ New task"
                onTextEditEnd={(e) => createTask(e.characters, { status })}
                fontFamily={FONT}
                fontSize={px(11)}
                fontWeight={500}
                fill={C.text}
                placeholderProps={{ fill: C.muted, fontWeight: 600 }}
                width="fill-parent"
                inputBehavior="wrap"
                inputFrameProps={{ padding: { vertical: px(6), horizontal: px(8) }, cornerRadius: px(8), hoverStyle: { fill: C.bg } }}
              />
            </AutoLayout>
          )}
        </AutoLayout>
      </AutoLayout>
    )
  }

  // ------------------------------------------------------------- done rows
  function DoneRow({ task, compact }: { task: Task; compact?: boolean }) {
    const open = openId === task.id
    const toggle = () => (open ? closeCard() : openCard(task.id))
    const frame = { fill: C.bg, cornerRadius: px(8), stroke: open ? C.accent : C.border, strokeWidth: open ? 2 : 1 }
    if (compact && !open) {
      // One node per recent completion; click to open (reopen/archive live in the editor).
      return (
        <Label key={task.id} size={11} weight={500} color={C.muted} strike width="fill-parent" truncate onClick={toggle} hover={C.accent} tooltip={task.completedAt ? `Completed ${fromTimestamp(task.completedAt)}` : undefined}>
          {`✓ ${task.title || 'Untitled'}${task.completedAt ? `  ·  ${fromTimestamp(task.completedAt)}` : ''}`}
        </Label>
      )
    }
    const row = (
      <AutoLayout key={task.id} direction="horizontal" width="fill-parent" spacing={px(8)} padding={{ vertical: px(5), horizontal: px(8) }} verticalAlignItems="center" {...(open ? {} : frame)}>
        <Label size={12} weight={700} color={task.archived ? C.faint : C.success}>
          {task.archived ? '■' : '✓'}
        </Label>
        {compact ? (
          <Label size={11} weight={500} color={C.muted} strike={!task.archived} width="fill-parent" truncate onClick={toggle}>
            {task.title || 'Untitled'}
          </Label>
        ) : (
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(1)} onClick={toggle}>
            <Label size={11} weight={500} color={C.muted} strike={!task.archived} width="fill-parent" truncate>
              {task.title || 'Untitled'}
            </Label>
            <Label size={9} color={C.faint} width="fill-parent" truncate>
              {[assigneesOf(task).length ? assigneesOf(task).join(', ') : 'Unassigned', task.due ? `due ${weekdayDate(task.due)}` : null, task.completedAt ? `completed ${fromTimestamp(task.completedAt)}` : null, task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null, labelsOf(task).length ? labelsOf(task).join(', ') : null]
                .filter(Boolean)
                .join(' · ')}
            </Label>
          </AutoLayout>
        )}
        {compact ? (
          <Label size={9} color={C.faint}>
            {task.completedAt ? fromTimestamp(task.completedAt) : ''}
          </Label>
        ) : (
          <AvatarStack task={task} size={16} />
        )}
        <Btn small tone="ghost" label="Reopen" onClick={() => reopen(task.id)} />
        {compact ? null : task.archived ? <Btn small tone="ghost" label="Restore" onClick={() => archive(task.id, false)} /> : <Btn small tone="ghost" label="Archive" onClick={() => archive(task.id, true)} />}
        {!compact && task.archived ? confirmDeleteId === task.id ? <Btn small tone="danger" label="Confirm" onClick={() => remove(task.id)} /> : <Btn small tone="ghost" label="Delete" onClick={() => setConfirmDeleteId(task.id)} /> : null}
      </AutoLayout>
    )
    if (!open) return row
    return (
      <AutoLayout key={task.id} direction="vertical" width="fill-parent" spacing={0} {...frame}>
        {row}
        <Editor task={task} showStatus inset />
      </AutoLayout>
    )
  }

  // ------------------------------------------------------------------ views
  function BoardView() {
    return (
      <AutoLayout direction="horizontal" spacing={COL_GAP} verticalAlignItems="start" width="hug-contents">
        {STATUSES.map((s) => (
          <Column key={s} status={s} />
        ))}
      </AutoLayout>
    )
  }

  function WeekView() {
    const pool = sortTasks(active.filter(matches))
    const groups: Array<{ key: string; title: string; sub?: string; items: Task[]; color: string; tint: string }> = []
    const overdue = pool.filter((t) => t.due && dueInfo(t.due).diff < 0)
    if (overdue.length) groups.push({ key: 'overdue', title: 'Overdue', items: overdue, color: C.danger, tint: '#FFF1F1' })
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(today, i)
      const items = pool.filter((t) => t.due === iso)
      const wd = dueInfo(iso).weekday
      groups.push({ key: iso, title: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : wd.split(',')[0], sub: wd, items, color: i === 0 ? C.accent : C.muted, tint: i === 0 ? C.accentSoft : C.surface })
    }
    const later = pool.filter((t) => t.due && dueInfo(t.due).diff > 6)
    if (later.length) groups.push({ key: 'later', title: 'Later', items: later, color: C.muted, tint: C.surface })
    const undated = pool.filter((t) => !t.due)
    groups.push({ key: 'none', title: 'No due date', sub: 'Click “+ date” on a card to schedule it', items: undated, color: C.muted, tint: C.canvas })

    return (
      <AutoLayout direction="vertical" spacing={px(8)} width={BOARD_W}>
        {groups.map((g) => {
          const title = `${g.title} · ${g.items.length}`
          const shown = capped(g.items, 'week:' + g.key)
          return (
            <AutoLayout key={g.key} direction="horizontal" width="fill-parent" spacing={px(10)} padding={px(10)} fill={g.tint} cornerRadius={px(12)} verticalAlignItems="start">
              {g.sub ? (
                <AutoLayout direction="vertical" width={px(118)} spacing={px(2)}>
                  <Label size={12} weight={700} color={g.color}>
                    {title}
                  </Label>
                  <Label size={9} color={C.faint} width="fill-parent">
                    {g.sub}
                  </Label>
                </AutoLayout>
              ) : (
                <Label size={12} weight={700} color={g.color} width={118}>
                  {title}
                </Label>
              )}
              {g.items.length ? (
                <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)}>
                  <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} wrap verticalAlignItems="start">
                    {shown.map((t) => (
                      <Card key={t.id} task={t} width={CARD_W} showStatus />
                    ))}
                  </AutoLayout>
                  <ShowMore keyName={'week:' + g.key} total={g.items.length} />
                </AutoLayout>
              ) : (
                <Label size={10} color={C.faint} italic width="fill-parent">
                  Nothing scheduled.
                </Label>
              )}
            </AutoLayout>
          )
        })}
      </AutoLayout>
    )
  }

  function DoneView() {
    const dq = doneSearch.trim().toLowerCase()
    const pool = (showArchived ? all.filter((t) => t.archived || t.status === 'done') : done)
      .filter(matches)
      .filter((t) => !dq || `${t.title} ${t.description} ${assigneesOf(t).join(' ')} ${labelsOf(t).join(' ')}`.toLowerCase().includes(dq))
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))
    const shown = capped(pool, 'done')

    return (
      <AutoLayout direction="vertical" spacing={px(8)} width={BOARD_W}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center">
          <AutoLayout direction="horizontal" spacing={px(6)} verticalAlignItems="center" padding={{ vertical: px(5), horizontal: px(9) }} fill={C.surface} cornerRadius={px(8)} width={px(260)}>
            <Input
              value={doneSearch || null}
              placeholder="Search completed tasks…"
              onTextEditEnd={(e) => setDoneSearch(e.characters)}
              fontFamily={FONT}
              fontSize={px(11)}
              fill={C.text}
              placeholderProps={{ fill: C.faint }}
              width="fill-parent"
              inputBehavior="truncate"
              inputFrameProps={{ padding: 0 }}
            />
            {doneSearch ? <GlyphBtn glyph="×" size={16} onClick={() => setDoneSearch('')} /> : null}
          </AutoLayout>
          <Chip label={`Show archived (${archived.length})`} active={showArchived} onClick={() => setShowArchived(!showArchived)} />
          <AutoLayout width="fill-parent" height={px(1)} />
          <Btn small label="Archive done > 14 days" onClick={archiveOld} />
        </AutoLayout>

        <AutoLayout direction="vertical" width="fill-parent" spacing={0} fill={STATUS_TINT.done} cornerRadius={px(12)} overflow="hidden">
          <Rectangle width="fill-parent" height={px(4)} fill={STATUS_COLOR.done} />
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
            <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
              <StatusGlyph status="done" size={13} />
              <Label size={12} weight={700}>
                {showArchived ? 'Completed & archived' : 'Completed'}
              </Label>
              <Pill text={String(pool.length)} color={C.success} solid size={10} />
            </AutoLayout>
            {shown.map((t) => (
              <DoneRow key={t.id} task={t} />
            ))}
            <ShowMore keyName="done" total={pool.length} />
            {pool.length === 0 ? (
              <Label size={10} color={C.faint} italic>
                {dq || anyFilter ? 'No completed tasks match.' : 'No completed tasks yet — click a card’s circle to mark it done.'}
              </Label>
            ) : null}
          </AutoLayout>
        </AutoLayout>
      </AutoLayout>
    )
  }

  /** Personal boards only: hours per task per ISO week; the month view lists the month's weeks one after another. */
  function HoursView() {
    const person = owner as string
    const period = periodFor(hoursPeriod.kind, hoursPeriod.offset)
    const weeks: Period[] = period.kind === 'week' ? [period] : weekKeysInMonth(period.key).map(weekPeriod).filter((w) => w.start <= today)
    const inRange = (ts: number | null, w: Period) => {
      if (!ts) return false
      const iso = toISO(new Date(ts))
      return iso >= w.start && iso <= w.end
    }
    const rowsFor = (w: Period) =>
      everything
        .filter((t) => isAssigned(t, person) && (hoursOf(t, person, w.key) > 0 || (!t.archived && (t.status !== 'done' || inRange(t.completedAt, w)))))
        .sort((a, b) => (labelsOf(a)[0] || '~').localeCompare(labelsOf(b)[0] || '~') || a.title.localeCompare(b.title))
    const sections = weeks.map((w) => {
      const rows = rowsFor(w)
      let sum = 0
      for (const t of rows) sum += hoursOf(t, person, w.key)
      return { week: w, rows, sum }
    })
    let total = 0
    const byLabel: Record<string, number> = {}
    for (const sec of sections) {
      total += sec.sum
      for (const t of sec.rows) {
        const h = hoursOf(t, person, sec.week.key)
        if (!h) continue
        const l = labelsOf(t)[0] || 'No label'
        byLabel[l] = (byLabel[l] || 0) + h
      }
    }
    const submittedAt = hoursSubmitted[period.key]
    const go = (kind: 'week' | 'month', offset: number) => setHoursPeriod({ kind, offset })
    const exportHours = (): Promise<void> => {
      const lines: string[] = []
      const csv: string[] = ['week,start,end,person,label,task,hours']
      for (const sec of sections) {
        for (const t of sec.rows) {
          const h = hoursOf(t, person, sec.week.key)
          if (!h) continue
          lines.push(`${sec.week.key}\t${labelsOf(t)[0] || ''}\t${t.title}\t${fmtHours(h)}`)
          csv.push([sec.week.key, sec.week.start, sec.week.end, person, labelsOf(t)[0] || '', t.title, fmtHours(h)].map(csvCell).join(','))
        }
        if (sections.length > 1 && sec.sum) lines.push(`${sec.week.key} total\t\t\t${fmtHours(sec.sum)}`)
      }
      lines.push(`Total\t\t\t${fmtHours(total)}`)
      const safe = person.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'hours'
      return new Promise<void>((resolve) => {
        figma.showUI(__html__, { width: 440, height: 330, title: 'Hours for your timesheet' })
        figma.ui.postMessage({ type: 'export', text: lines.join('\n'), csv: csv.join('\r\n'), filename: `hours-${safe}-${period.key}`, title: `${period.label} · ${fmtHours(total)}h`, hint: 'Tab-separated lines: copy and paste them into your timesheet tool, or download the CSV.', hideJson: true })
        figma.ui.onmessage = (msg: { type: string }) => {
          if (msg && msg.type === 'saved') toast('Hours exported')
          if (msg && (msg.type === 'saved' || msg.type === 'cancel')) {
            figma.closePlugin()
            resolve()
          }
        }
      })
    }
    const dates = (t: Task) => `Created ${fromTimestamp(t.createdAt)}${t.completedAt ? ` · Completed ${fromTimestamp(t.completedAt)}` : ''}`

    return (
      <AutoLayout direction="vertical" spacing={px(8)} width={BOARD_W}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center" wrap>
          <Chip small label="Week" active={period.kind === 'week'} onClick={() => go('week', 0)} />
          <Chip small label="Month" active={period.kind === 'month'} onClick={() => go('month', 0)} />
          <AutoLayout width={px(6)} height={px(1)} />
          <GlyphBtn glyph="‹" onClick={() => go(period.kind, hoursPeriod.offset - 1)} />
          <Label size={12} weight={700}>
            {period.label}
          </Label>
          <GlyphBtn glyph="›" onClick={() => go(period.kind, hoursPeriod.offset + 1)} />
          {hoursPeriod.offset !== 0 ? <Chip small label={period.kind === 'week' ? 'This week' : 'This month'} onClick={() => go(period.kind, 0)} /> : null}
          <AutoLayout width="fill-parent" height={px(1)} />
          {submittedAt ? <Pill text={`Submitted ${fromTimestamp(submittedAt)} ✓`} color={C.success} fill={C.successSoft} size={10} /> : null}
        </AutoLayout>

        <AutoLayout direction="vertical" width="fill-parent" spacing={0} fill={C.canvas} cornerRadius={px(12)} overflow="hidden" stroke={C.border}>
          <Rectangle width="fill-parent" height={px(4)} fill={C.accent} />
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(4)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
            <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
              <Label size={12} weight={700} width="fill-parent">
                {`${person.split(/[\s|]+/)[0]}’s hours`}
              </Label>
              <Label size={10} weight={600} color={C.muted}>
                {`${fmtHours(total)}h`}
              </Label>
            </AutoLayout>
            {sections.map((sec) => {
              const shown = capped(sec.rows, 'hours:' + sec.week.key)
              return (
                <AutoLayout key={sec.week.key} direction="vertical" width="fill-parent" spacing={px(2)}>
                  {sections.length > 1 ? (
                    <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center" padding={{ top: px(8), bottom: px(2) }}>
                      <Label size={11} weight={700} color={C.accentText} width="fill-parent">
                        {sec.week.label}
                      </Label>
                      <Label size={10} weight={700} color={sec.sum ? C.accentText : C.faint}>
                        {`${fmtHours(sec.sum)}h`}
                      </Label>
                    </AutoLayout>
                  ) : null}
                  {shown.map((t) => {
                    const h = hoursOf(t, person, sec.week.key)
                    const label = labelsOf(t)[0]
                    return (
                      <AutoLayout key={t.id} direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center" padding={{ vertical: px(3) }}>
                        <StatusGlyph status={t.status} size={12} />
                        <AutoLayout direction="vertical" width="fill-parent" spacing={px(1)}>
                          <Label size={11} weight={500} width="fill-parent" truncate>
                            {t.title || 'Untitled'}
                          </Label>
                          <Label size={9} color={C.faint} width="fill-parent" truncate>
                            {dates(t)}
                          </Label>
                        </AutoLayout>
                        {label ? <LabelPill name={label} quiet /> : null}
                        <AutoLayout direction="horizontal" spacing={px(3)} verticalAlignItems="center" padding={{ vertical: px(2), horizontal: px(6) }} fill={h ? C.accentSoft : C.bg} stroke={h ? C.accent : C.border} cornerRadius={px(6)}>
                          <Input
                            value={h ? fmtHours(h) : null}
                            placeholder="0"
                            onTextEditEnd={(e) => {
                              const v = parseFloat(e.characters.replace(',', '.'))
                              const next = isFinite(v) && v > 0 ? v : 0
                              if (next !== h) setTaskHours(t.id, person, sec.week.key, next)
                            }}
                            fontFamily={FONT}
                            fontSize={px(11)}
                            fontWeight={700}
                            fill={h ? C.accent : C.text}
                            placeholderProps={{ fill: C.faint, fontWeight: 400 }}
                            width={px(34)}
                            horizontalAlignText="right"
                            inputBehavior="truncate"
                            inputFrameProps={{ padding: 0 }}
                          />
                          <Label size={10} weight={600} color={h ? C.accent : C.faint}>
                            h
                          </Label>
                        </AutoLayout>
                      </AutoLayout>
                    )
                  })}
                  <ShowMore keyName={'hours:' + sec.week.key} total={sec.rows.length} />
                  {sec.rows.length === 0 ? (
                    <Label size={10} color={C.faint} italic>
                      No tasks of yours this week.
                    </Label>
                  ) : null}
                </AutoLayout>
              )
            })}
            <Divider />
            <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center" wrap>
              {Object.keys(byLabel)
                .sort()
                .map((l) => (
                  <Label key={l} size={10} weight={600} color={C.muted}>
                    {`${l} ${fmtHours(byLabel[l])}h`}
                  </Label>
                ))}
              <AutoLayout width="fill-parent" height={px(1)} />
              <Label size={12} weight={700}>
                {`Total ${fmtHours(total)}h`}
              </Label>
            </AutoLayout>
            <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
              <AutoLayout width="fill-parent" height={px(1)} />
              <Btn
                small
                tone={submittedAt ? 'ghost' : 'default'}
                label={submittedAt ? 'Unmark submitted' : 'Mark as submitted'}
                onClick={() => {
                  const next = { ...hoursSubmitted }
                  if (submittedAt) delete next[period.key]
                  else next[period.key] = Date.now()
                  setHoursSubmitted(next)
                }}
              />
              <Btn small tone="primary" label="Copy for timesheet" onClick={exportHours} />
            </AutoLayout>
          </AutoLayout>
        </AutoLayout>
      </AutoLayout>
    )
  }

  function PeopleView() {
    const pool = active.filter(matches)
    const nameSet = new Set<string>()
    let anyUnassigned = false
    for (const t of pool) {
      const ns = assigneesOf(t)
      if (!ns.length) anyUnassigned = true
      for (const n of ns) nameSet.add(n)
    }
    const names = Array.from(nameSet).sort((a, b) => a.localeCompare(b))
    if (anyUnassigned) names.push('')
    return (
      <AutoLayout direction="horizontal" spacing={COL_GAP} wrap width={BOARD_W} verticalAlignItems="start">
        {names.length === 0 ? (
          <Label size={10} color={C.faint} italic>
            No active tasks.
          </Label>
        ) : null}
        {names.map((name) => {
          const items = sortTasks(pool.filter((t) => (name ? isAssigned(t, name) : assigneesOf(t).length === 0)))
          const od = items.filter(isLate).length
          const [bg, fg] = name ? avatarColors(name) : [C.surface, C.muted]
          const shown = capped(items, 'people:' + name)
          return (
            <AutoLayout key={name || '__none__'} direction="vertical" width={COL_W} spacing={0} fill={C.canvas} cornerRadius={px(12)} overflow="hidden" stroke={C.border}>
              <Rectangle width="fill-parent" height={px(4)} fill={fg} />
              <AutoLayout direction="vertical" width="fill-parent" spacing={px(8)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
                <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
                  <Avatar name={name} photo={photoOf(name)} size={20} />
                  <Label size={12} weight={700} color={name ? C.text : C.muted} italic={!name} width="fill-parent" truncate>
                    {name || 'Unassigned'}
                  </Label>
                  {od ? <Pill text={`${od} overdue`} color={C.danger} fill={C.dangerSoft} /> : null}
                  <Pill text={String(items.length)} color={fg} solid size={10} />
                </AutoLayout>
                {shown.map((t) => (
                  <Card key={t.id} task={t} width="fill-parent" showStatus />
                ))}
                <ShowMore keyName={'people:' + name} total={items.length} />
              </AutoLayout>
            </AutoLayout>
          )
        })}
      </AutoLayout>
    )
  }

  function SyncView() {
    const agenda = sortTasks(live.filter((t) => t.discuss).filter(matches))
    return (
      <AutoLayout direction="vertical" spacing={px(8)} width={BOARD_W}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center">
          <Label size={11} color={C.muted} width="fill-parent">
            Flag any task with “Discuss in team sync”. Before the meeting, drop the agenda onto the canvas as stickies and work through it there.
          </Label>
          {agenda.length ? <Btn small tone="ghost" label="Clear agenda" onClick={() => patchMany(agenda.map((t) => t.id), { discuss: false })} /> : null}
          <Btn label="Create agenda on canvas" tone="primary" onClick={createAgendaOnCanvas} />
        </AutoLayout>
        <AutoLayout direction="vertical" width="fill-parent" spacing={0} fill={C.accentSoft} cornerRadius={px(12)} overflow="hidden">
          <Rectangle width="fill-parent" height={px(4)} fill={C.accent} />
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
            <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
              <Label size={12} weight={700}>
                {`Team sync agenda · ${weekdayDate(today)}`}
              </Label>
              <Pill text={String(agenda.length)} color={C.accent} solid size={10} />
            </AutoLayout>
            {agenda.length ? (
              agenda.map((t) => <AgendaRow key={t.id} task={t} />)
            ) : (
              <Label size={10} color={C.faint} italic>
                Nothing on the agenda yet — open a task and click “Discuss in team sync”.
              </Label>
            )}
          </AutoLayout>
        </AutoLayout>
      </AutoLayout>
    )
  }

  function AgendaRow({ task }: { task: Task }) {
    const open = openId === task.id
    const late = isLate(task)
    const due = task.due ? dueInfo(task.due) : null
    const toggle = () => (open ? closeCard() : openCard(task.id))
    const frame = { fill: C.bg, cornerRadius: px(8), stroke: open ? C.accent : C.border, strokeWidth: open ? 2 : 1 }
    const row = (
      <AutoLayout key={task.id} direction="horizontal" width="fill-parent" spacing={px(8)} padding={{ vertical: px(6), horizontal: px(8) }} verticalAlignItems="start" {...(open ? {} : frame)}>
        <AutoLayout width={px(16)} height={px(16)} cornerRadius={px(4)} stroke={C.accent} strokeWidth={1.5} onClick={() => setDiscuss(task.id, false)} hoverStyle={{ fill: C.accentSoft }} />
        <AutoLayout direction="vertical" width="fill-parent" spacing={px(3)}>
          <Label size={12} weight={600} width="fill-parent" truncate={2} onClick={toggle}>
            {task.title || 'Untitled'}
          </Label>
          <AutoLayout direction="horizontal" spacing={px(6)} wrap verticalAlignItems="center" width="fill-parent">
            <Label size={10} weight={700} color={STATUS_COLOR[task.status]}>
              {STATUS_LABEL[task.status]}
            </Label>
            <AvatarStack task={task} size={16} />
            <Label size={10} weight={500} color={assigneesOf(task).length ? C.text : C.faint} italic={!assigneesOf(task).length}>
              {assigneesOf(task).length ? assigneesOf(task).map((n) => shortName(n, 20)).join(', ') : 'Unassigned'}
            </Label>
            {due ? (
              <Label size={10} weight={late ? 700 : 500} color={late ? C.danger : C.muted}>
                {late ? `Overdue · ${due.label}` : due.label}
              </Label>
            ) : null}
            {labelsOf(task).map((l) => (
              <LabelPill key={l} name={l} quiet />
            ))}
          </AutoLayout>
          <Input
            value={task.discussNote || null}
            placeholder="Add a talking point…"
            onTextEditEnd={(e) => {
              if (e.characters !== (task.discussNote ?? '')) patch(task.id, { discussNote: e.characters })
            }}
            fontFamily={FONT}
            fontSize={px(11)}
            fill={C.text}
            placeholderProps={{ fill: C.faint }}
            width="fill-parent"
            inputBehavior="multiline"
            inputFrameProps={{ padding: { vertical: px(4), horizontal: px(7) }, fill: C.surface, cornerRadius: px(6) }}
          />
        </AutoLayout>
        <GlyphBtn glyph={open ? '⌃' : '›'} onClick={toggle} />
      </AutoLayout>
    )
    if (!open) return row
    return (
      <AutoLayout key={task.id} direction="vertical" width="fill-parent" spacing={0} {...frame}>
        {row}
        <Editor task={task} showStatus inset />
      </AutoLayout>
    )
  }

  // ---------------------------------------------------------------- panels
  function FilterGroup({ label, children }: { label: string; children?: any }) {
    return (
      <AutoLayout direction="horizontal" spacing={px(5)} verticalAlignItems="center">
        <Label size={9} weight={700} color={C.faint}>
          {label.toUpperCase()}
        </Label>
        {children}
      </AutoLayout>
    )
  }

  function FilterPanel() {
    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={px(8)} padding={px(10)} fill={C.bg} cornerRadius={px(12)} stroke={C.border}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(14)} wrap verticalAlignItems="center">
          <FilterGroup label="Quick">
            <Chip small label={`Overdue (${overdueCount})`} color={C.danger} soft={C.dangerSoft} active={filters.due === 'overdue'} onClick={() => toggleFilter('due', 'overdue')} />
            <Chip small label={`Unassigned (${unassignedCount})`} active={filters.assignee === '__none__'} onClick={() => toggleFilter('assignee', '__none__')} dashed />
            <Chip small label={`Stale ${staleDays}d+ (${staleCount})`} color={C.warn} soft={C.warnSoft} active={filters.stale} onClick={() => setFilter('stale', !filters.stale)} />
          </FilterGroup>
          <FilterGroup label="Due">
            <Chip small label="Today" active={filters.due === 'today'} onClick={() => toggleFilter('due', 'today')} />
            <Chip small label="This week" active={filters.due === 'week'} onClick={() => toggleFilter('due', 'week')} />
            <Chip small label="No date" active={filters.due === 'none'} onClick={() => toggleFilter('due', 'none')} />
          </FilterGroup>
          <FilterGroup label="Priority">
            {PRIORITIES.map((p) => (
              <Chip key={p} small label={PRIORITY_GLYPH[p]} color={PRIORITY_COLOR[p]} soft={PRIORITY_SOFT[p]} active={filters.priority === p} onClick={() => toggleFilter('priority', p)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Status">
            {STATUSES.map((s) => (
              <Chip key={s} small label={STATUS_LABEL[s]} color={STATUS_COLOR[s]} soft={STATUS_SOFT[s]} active={filters.status === s} onClick={() => toggleFilter('status', s)} />
            ))}
          </FilterGroup>
        </AutoLayout>
        {knownLabels.length || knownAssignees.length ? (
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(14)} wrap verticalAlignItems="center">
            {knownLabels.length ? (
              <FilterGroup label="Label">
                {knownLabels.map((l) => (
                  <LabelPill key={l} name={l} size={10} active={filters.label === l} onClick={() => toggleFilter('label', l)} />
                ))}
              </FilterGroup>
            ) : null}
            {knownAssignees.length ? (
              <FilterGroup label="People">
                {knownAssignees.map((a) => (
                  <PersonChip key={a} name={a} active={filters.assignee === a} onClick={() => toggleFilter('assignee', a)} />
                ))}
              </FilterGroup>
            ) : null}
          </AutoLayout>
        ) : null}
        {anyFilter ? (
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
            <Label size={10} color={C.muted}>
              {`${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}${search ? ' + search' : ''} active`}
            </Label>
            <Btn small tone="ghost" label="Clear all" onClick={clearFilters} />
          </AutoLayout>
        ) : null}
      </AutoLayout>
    )
  }

  function ViewTab({ id, label, count }: { id: View; label: string; count?: number }) {
    const on = view === id
    return (
      <AutoLayout direction="horizontal" spacing={px(5)} padding={{ vertical: px(5), horizontal: px(12) }} cornerRadius={px(7)} fill={on ? C.bg : undefined} stroke={on ? C.border : undefined} verticalAlignItems="center" onClick={() => setView(id)} hoverStyle={{ fill: on ? C.bg : C.surfaceAlt }}>
        <Label size={11} weight={on ? 700 : 500} color={on ? C.text : C.muted}>
          {label}
        </Label>
        {count !== undefined && count > 0 ? <Pill text={String(count)} color={id === 'sync' ? C.accent : on ? C.success : C.muted} solid /> : null}
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- header
  void storeVersion
  const mainView = view === 'week' ? <WeekView /> : view === 'sync' ? <SyncView /> : view === 'people' && !owner ? <PeopleView /> : view === 'hours' && owner ? <HoursView /> : view === 'done' ? <DoneView /> : <BoardView />

  return (
    <AutoLayout direction="vertical" spacing={px(10)} padding={px(14)} fill={C.bg} cornerRadius={px(16)} stroke={C.border} strokeWidth={1} width="hug-contents">
      {/* Row 1: identity + primary action */}
      <AutoLayout direction="horizontal" width={BOARD_W} spacing={px(12)} verticalAlignItems="center">
        {owner ? <Avatar name={owner} photo={scope.kind === 'personal' ? scope.photoUrl ?? photoOf(owner) : null} size={30} /> : null}
        <Input
          value={boardTitle}
          placeholder="Board title"
          onTextEditEnd={(e) => setBoardTitle(e.characters.trim() || 'Team tasks')}
          fontFamily={FONT}
          fontSize={px(16)}
          fontWeight={700}
          fill={C.text}
          width={px(220)}
          inputBehavior="truncate"
          inputFrameProps={{ padding: 0 }}
        />
        <AutoLayout direction="horizontal" spacing={px(4)} verticalAlignItems="center" width="fill-parent">
          <Pill text={owner ? 'My board' : 'Team board'} color={owner ? C.accent : C.muted} fill={owner ? C.accentSoft : C.surface} size={10} />
          <Pill text={liveSync ? 'Live sync' : 'Manual sync'} color={liveSync ? C.success : C.muted} fill={liveSync ? C.successSoft : C.surface} size={10} onClick={() => setLive(!liveSync)} tooltip={liveSync ? 'Switch to manual sync' : 'Switch to live sync'} />
          <Pill text={`${active.length} active`} color={C.muted} fill={C.surface} size={10} />
          {doneToday ? <TodayRing /> : null}
          {overdueCount ? <Pill text={`${overdueCount} overdue`} color={C.danger} fill={C.dangerSoft} size={10} onClick={() => setFilter('due', filters.due === 'overdue' ? null : 'overdue')} /> : null}
          {blockedCount ? <Pill text={`${blockedCount} blocked`} color={STATUS_COLOR.blocked} fill={STATUS_SOFT.blocked} size={10} /> : null}
          {unassignedCount ? <Pill text={`${unassignedCount} unassigned`} color={C.muted} fill={C.surface} size={10} onClick={() => setFilter('assignee', filters.assignee === '__none__' ? null : '__none__')} /> : null}
        </AutoLayout>
        <Btn small tone="ghost" label={owner ? 'Switch to team board' : 'Make this my board'} onClick={owner ? makeTeam : makeMine} />
        <Btn label="+ Add task" tone="primary" onClick={addTask} />
      </AutoLayout>

      {/* Row 2: navigation + search/filter */}
      <AutoLayout direction="horizontal" width={BOARD_W} spacing={px(10)} verticalAlignItems="center">
        <AutoLayout direction="horizontal" spacing={px(2)} padding={px(3)} fill={C.surface} cornerRadius={px(9)}>
          <ViewTab id="board" label="Board" />
          <ViewTab id="week" label="Week" />
          <ViewTab id="done" label="Done" count={done.length} />
          <ViewTab id="sync" label="Sync" count={agendaCount} />
          {owner ? <ViewTab id="hours" label="Hours" /> : <ViewTab id="people" label="People" />}
        </AutoLayout>
        <AutoLayout width="fill-parent" height={px(1)} />
        <AutoLayout direction="horizontal" spacing={px(6)} verticalAlignItems="center" padding={{ vertical: px(6), horizontal: px(10) }} fill={C.surface} stroke={search ? C.accent : undefined} cornerRadius={px(8)} width={px(220)}>
          <Input
            value={search || null}
            placeholder="Search tasks, labels, people…"
            onTextEditEnd={(e) => setSearch(e.characters)}
            fontFamily={FONT}
            fontSize={px(11)}
            fill={C.text}
            placeholderProps={{ fill: C.faint }}
            width="fill-parent"
            inputBehavior="truncate"
            inputFrameProps={{ padding: 0 }}
          />
          {search ? <GlyphBtn glyph="×" size={16} onClick={() => setSearch('')} /> : null}
        </AutoLayout>
        <Btn label={activeFilterCount ? `Filters · ${activeFilterCount}` : 'Filters'} tone={filtersOpen || activeFilterCount ? 'primary' : 'default'} onClick={() => setFiltersOpen(!filtersOpen)} />
        <Btn label="Sync" onClick={refresh} />
        <Btn label="Export" onClick={() => exportDialog(all, everything, people.values(), boardTitle)} />
        <Btn label="Import" onClick={importBackup} />
        <Btn label="From stickies" onClick={importStickies} />
      </AutoLayout>

      {filtersOpen ? <FilterPanel /> : null}

      {live.length === 0 ? (
        <AutoLayout direction="horizontal" width={BOARD_W} spacing={px(8)} padding={{ vertical: px(8), horizontal: px(10) }} fill={C.surface} cornerRadius={px(10)} verticalAlignItems="center">
          <Label size={11} color={C.muted} width="fill-parent">
            Empty board. Type a title into any column, use “Add task”, or load a few sample tasks to see how it works.
          </Label>
          <Btn small label="Load sample tasks" onClick={addSamples} />
        </AutoLayout>
      ) : null}

      {mainView}
    </AutoLayout>
  )
}

widget.register(Widget)
