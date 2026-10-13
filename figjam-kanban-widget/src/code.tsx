import {
  Draft,
  EMPTY_FILTERS,
  Filters,
  Person,
  PRIORITIES,
  Scope,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  SortMode,
  STATUSES,
  STATUS_LABEL,
  STATUS_SHORT,
  Status,
  Subtask,
  Task,
  View,
} from './types'
import { addDaysISO, ageInDays, daysFromToday, dueLabel, fromTimestamp, isOverdue, todayISO, weekdayDate } from './dates'
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
// Layout constants
// ---------------------------------------------------------------------------
const FONT = 'Inter'

/**
 * Global UI scale. Every dimension in the tree goes through px() so the whole
 * widget can be rendered Compact / Comfortable / Large from the property menu.
 * K is set at the top of each render (rendering is synchronous).
 */
let K = 1.35
const px = (n: number) => Math.round(n * K)
const SCALES: Record<string, number> = { compact: 1, comfortable: 1.35, large: 1.7 }

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const toast = (msg: string) => figma.notify(msg, { timeout: 1400 })
const shortName = (s: string, n = 14) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const subtasksOf = (t: Task): Subtask[] => t.subtasks ?? []
const hexToRgb = (hex: string): RGB => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 })
const labelsOf = (t: Task): string[] => t.labels ?? []

// ---------------------------------------------------------------------------
// Primitive-based glyphs (no SVG → cheap to re-render)
// ---------------------------------------------------------------------------
function Icon({ name, color, size = 12 }: { name: IconName; color: string; size?: number }) {
  const sz = px(size)
  return <SVG src={icon(name, color, sz)} width={sz} height={sz} />
}

/** Status glyph drawn with frames/ellipse/text instead of SVG. */
function StatusGlyph({ status, size = 12, color, muted }: { status: Status; size?: number; color?: string; muted?: boolean }) {
  const c = color ?? (muted ? C.faint : STATUS_COLOR[status])
  const sz = px(size)
  const r = sz / 2
  if (status === 'done') {
    return (
      <AutoLayout width={sz} height={sz} cornerRadius={r} fill={c} horizontalAlignItems="center" verticalAlignItems="center">
        <Text fontFamily={FONT} fontSize={Math.round(sz * 0.66)} fontWeight={700} fill="#FFFFFF" lineHeight={sz}>
          ✓
        </Text>
      </AutoLayout>
    )
  }
  return (
    <AutoLayout width={sz} height={sz} cornerRadius={r} stroke={c} strokeWidth={1.5} strokeAlign="inside" horizontalAlignItems="center" verticalAlignItems="center">
      {status === 'inprogress' ? (
        <Ellipse width={sz - px(5)} height={sz - px(5)} fill={c} arcData={{ startingAngle: -Math.PI / 2, endingAngle: Math.PI / 2, innerRadius: 0 }} />
      ) : status === 'blocked' ? (
        <Rectangle width={Math.round(size * 0.45)} height={px(1.5)} fill={c} />
      ) : null}
    </AutoLayout>
  )
}

/** Profile photo when Figma gave us one, initials otherwise, dashed "?" when unassigned. */
function Avatar({ name, photo, size = 18 }: { name: string; photo?: string | null; size?: number }) {
  const sz = px(size)
  if (!name) {
    return (
      <AutoLayout width={sz} height={sz} cornerRadius={sz / 2} stroke={C.borderStrong} strokeDashPattern={[2, 2]} horizontalAlignItems="center" verticalAlignItems="center">
        <Text fontFamily={FONT} fontSize={Math.round(sz * 0.5)} fontWeight={600} fill={C.faint} lineHeight={sz}>
          ?
        </Text>
      </AutoLayout>
    )
  }
  if (photo) {
    return <Image src={photo} width={sz} height={sz} cornerRadius={sz / 2} />
  }
  const [bg, fg] = avatarColors(name)
  return (
    <AutoLayout width={sz} height={sz} cornerRadius={sz / 2} fill={bg} horizontalAlignItems="center" verticalAlignItems="center">
      <Text fontFamily={FONT} fontSize={Math.round(sz * 0.44)} fontWeight={700} fill={fg} lineHeight={sz} letterSpacing={0.2}>
        {initials(name)}
      </Text>
    </AutoLayout>
  )
}

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
}) {
  const size = px(props.size ?? 11)
  return (
    <Text
      fontFamily={FONT}
      fontSize={size}
      fontWeight={props.weight ?? 400}
      fill={props.color ?? C.text}
      width={typeof props.width === 'number' ? px(props.width) : props.width ?? 'hug-contents'}
      truncate={props.truncate}
      textDecoration={props.strike ? 'strikethrough' : 'none'}
      italic={props.italic}
      horizontalAlignText={props.align ?? 'left'}
      lineHeight={Math.round(size * 1.35)}
    >
      {props.children}
    </Text>
  )
}

function Btn(props: {
  label?: string
  icon?: IconName
  onClick: () => void | Promise<void>
  tone?: 'default' | 'primary' | 'ghost' | 'danger'
  tooltip?: string
  small?: boolean
}) {
  const tone = props.tone ?? 'default'
  const fill = tone === 'primary' ? C.accent : tone === 'ghost' ? undefined : tone === 'danger' ? C.dangerSoft : C.bg
  const color = tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? C.danger : tone === 'ghost' ? C.muted : C.text
  const hover = tone === 'primary' ? C.accentHover : tone === 'danger' ? '#FECACA' : C.surfaceAlt
  const pad = props.small ? { vertical: px(3), horizontal: px(7) } : { vertical: px(6), horizontal: px(10) }
  return (
    <AutoLayout
      direction="horizontal"
      spacing={px(5)}
      padding={pad}
      cornerRadius={px(8)}
      fill={fill}
      stroke={tone === 'default' ? C.border : undefined}
      strokeWidth={1}
      verticalAlignItems="center"
      onClick={props.onClick}
      hoverStyle={{ fill: hover }}
      tooltip={props.tooltip}
    >
      {props.icon ? <Icon name={props.icon} color={color} size={props.small ? 11 : 12} /> : null}
      {props.label ? (
        <Label size={props.small ? 10 : 11} weight={600} color={color}>
          {props.label}
        </Label>
      ) : null}
    </AutoLayout>
  )
}

function IconBtn(props: { icon: IconName; onClick: () => void | Promise<void>; tooltip?: string; color?: string; size?: number }) {
  const s = px(props.size ?? 20)
  return (
    <AutoLayout width={s} height={s} cornerRadius={px(6)} horizontalAlignItems="center" verticalAlignItems="center" onClick={props.onClick} hoverStyle={{ fill: C.surfaceAlt }} tooltip={props.tooltip}>
      <Icon name={props.icon} color={props.color ?? C.muted} size={Math.round((props.size ?? 20) * 0.6)} />
    </AutoLayout>
  )
}

/** Text toggle chip (filters, option rows). Optional leading glyph node. */
function Chip(props: {
  label: string
  active?: boolean
  onClick: () => void | Promise<void>
  color?: string
  soft?: string
  tooltip?: string
  dashed?: boolean
  lead?: any
  small?: boolean
}) {
  const active = !!props.active
  const color = props.color ?? C.accent
  const soft = props.soft ?? C.accentSoft
  return (
    <AutoLayout
      direction="horizontal"
      spacing={px(4)}
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
      {props.lead ?? null}
      <Label size={10} weight={600} color={active ? color : C.muted}>
        {props.label}
      </Label>
    </AutoLayout>
  )
}

function Pill({ text, color, fill, size = 9, onClick, tooltip }: { text: string; color: string; fill: string; size?: number; onClick?: () => void; tooltip?: string }) {
  return (
    <AutoLayout padding={{ vertical: px(1), horizontal: px(6) }} cornerRadius={px(999)} fill={fill} verticalAlignItems="center" onClick={onClick} tooltip={tooltip}>
      <Label size={size} weight={700} color={color}>
        {text}
      </Label>
    </AutoLayout>
  )
}

function LabelPill({ name, size = 9, onClick, active = true }: { name: string; size?: number; onClick?: () => void; active?: boolean }) {
  const [bg, fg] = labelColors(name)
  return (
    <AutoLayout
      padding={{ vertical: px(1), horizontal: px(6) }}
      cornerRadius={px(4)}
      fill={active ? bg : C.bg}
      stroke={active ? undefined : C.border}
      strokeDashPattern={active ? undefined : [3, 2]}
      verticalAlignItems="center"
      onClick={onClick}
      hoverStyle={onClick ? { fill: bg } : undefined}
      tooltip={onClick ? (active ? `Remove label “${name}”` : `Add label “${name}”`) : `Label: ${name}`}
    >
      <Label size={size} weight={700} color={active ? fg : C.muted}>
        {name}
      </Label>
    </AutoLayout>
  )
}

function Divider() {
  return <Rectangle width="fill-parent" height={px(1)} fill={C.border} />
}

function Progress({ done, total, width: w }: { done: number; total: number; width: number | 'fill-parent' }) {
  const pct = total ? done / total : 0
  const width = typeof w === 'number' ? px(w) : w
  return (
    <AutoLayout width={width} height={px(4)} cornerRadius={px(2)} fill={C.surfaceAlt}>
      {pct > 0 ? <Rectangle width={typeof width === 'number' ? Math.max(4, Math.round(width * pct)) : 'fill-parent'} height={px(4)} cornerRadius={px(2)} fill={pct >= 1 ? C.success : C.accent} /> : null}
    </AutoLayout>
  )
}

// ---------------------------------------------------------------------------
// Date picker (iframe) – the only part that needs an iframe UI
// ---------------------------------------------------------------------------
function pickDate(title: string, current: string | null, onPick: (iso: string | null) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    figma.showUI(__html__, { width: 300, height: 190, title: 'Due date' })
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
// Figma requires an alphanumeric namespace for shared plugin data (a hyphen here silently broke every write).
const NS = 'kanbanlite'
/** Every useSyncedState key this widget uses — preserved when pushing state into another instance. */
const STATE_KEYS = [
  'view',
  'collapsed2',
  'openId',
  'confirmDeleteId',
  'filters',
  'filtersOpen',
  'search',
  'sort',
  'quickAddOpen',
  'draft',
  'celebrating',
  'showArchived',
  'doneSearch',
  'staleDays',
  'boardTitle',
  'uiSize',
  'scope',
  'storeVersion',
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

// ---------------------------------------------------------------------------
// CSV export – builds the file in the sandbox, hands it to the iframe to save
// ---------------------------------------------------------------------------
const csvCell = (v: string | number | boolean | null | undefined): string => {
  const str = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
}
const isoDateTime = (ts: number | null) => (ts ? new Date(ts).toISOString() : '')

function tasksToCsv(list: Task[]): string {
  const header = ['id', 'title', 'description', 'status', 'assignee', 'due', 'priority', 'labels', 'subtasks_done', 'subtasks_total', 'subtasks', 'created_at', 'updated_at', 'completed_at', 'archived']
  const rows = list.map((t) => {
    const subs = subtasksOf(t)
    return [
      t.id,
      t.title,
      t.description,
      STATUS_LABEL[t.status],
      t.assignee,
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
    ].map(csvCell).join(',')
  })
  return [header.join(','), ...rows].join('\r\n')
}

function exportCsv(list: Task[], boardTitle: string): Promise<void> {
  const csv = tasksToCsv(list)
  const safe = boardTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'tasks'
  const filename = `${safe}-${todayISO()}.csv`
  return new Promise<void>((resolve) => {
    figma.showUI(__html__, { width: 420, height: 300, title: 'Export tasks as CSV' })
    figma.ui.postMessage({ type: 'export', csv, filename, count: list.length })
    figma.ui.onmessage = (msg: { type: string }) => {
      if (msg && msg.type === 'saved') toast(`Exported ${list.length} tasks`)
      figma.closePlugin()
      resolve()
    }
  })
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------
function Widget() {
  const tasks = useSyncedMap<Task>('tasks')
  const people = useSyncedMap<Person>('people')
  const [view, setView] = useSyncedState<View>('view', 'board')
  const [collapsed, setCollapsed] = useSyncedState<Record<string, boolean>>('collapsed2', {})
  const [openId, setOpenId] = useSyncedState<string | null>('openId', null)
  const [confirmDeleteId, setConfirmDeleteId] = useSyncedState<string | null>('confirmDeleteId', null)
  const [filters, setFilters] = useSyncedState<Filters>('filters', EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useSyncedState<boolean>('filtersOpen', false)
  const [search, setSearch] = useSyncedState<string>('search', '')
  const [sort, setSort] = useSyncedState<SortMode>('sort', 'due')
  const [quickAddOpen, setQuickAddOpen] = useSyncedState<boolean>('quickAddOpen', false)
  const [draft, setDraft] = useSyncedState<Draft>('draft', { status: 'todo', priority: null, due: null, assignee: '', label: null })
  const [celebrating, setCelebrating] = useSyncedState<string | null>('celebrating', null)
  const [showArchived, setShowArchived] = useSyncedState<boolean>('showArchived', false)
  const [doneSearch, setDoneSearch] = useSyncedState<string>('doneSearch', '')
  const [staleDays, setStaleDays] = useSyncedState<number>('staleDays', 7)
  const [boardTitle, setBoardTitle] = useSyncedState<string>('boardTitle', 'Team tasks')
  const [uiSize, setUiSize] = useSyncedState<string>('uiSize', 'comfortable')
  const [scope, setScope] = useSyncedState<Scope>('scope', { kind: 'team' })
  /** Bumped by other boards on this page when they write, which re-renders this one. */
  const [storeVersion] = useSyncedState<number>('storeVersion', 0)
  const widgetId = useWidgetNodeId()
  K = SCALES[uiSize] ?? 1.35
  const owner = scope.kind === 'personal' ? scope.name : null

  const COL_W = px(300)
  const COL_GAP = px(10)
  const BOARD_W = COL_W * 4 + COL_GAP * 3
  const COLLAPSED_W = px(40)
  const CARD_W = COL_W - px(20)

  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  const nextWeek = addDaysISO(today, 7)
  const everything = tasks.values()
  /** Personal boards only show tasks assigned to their owner; the store still holds everything. */
  const all = owner ? everything.filter((t) => t.assignee === owner) : everything
  const live = all.filter((t) => !t.archived)
  const active = live.filter((t) => t.status !== 'done')
  const done = live.filter((t) => t.status === 'done')
  const archived = all.filter((t) => t.archived)

  // ------------------------------------------------------------------ people
  /**
   * Figma only lets us read currentUser / activeUsers inside event handlers,
   * so every mutation records who is around. That gives us profile photos for
   * anyone who has touched the board or been in the file while someone did.
   */
  const syncPeople = () => {
    const seen: Array<User | null> = [figma.currentUser, ...figma.activeUsers]
    const now = Date.now()
    for (const u of seen) {
      if (!u || !u.name) continue
      const prev = people.get(u.name)
      if (!prev || prev.photoUrl !== (u.photoUrl ?? null) || now - prev.seenAt > 3600000) {
        const person: Person = { name: u.name, photoUrl: u.photoUrl ?? null, seenAt: now }
        people.set(u.name, person)
        storeWrite('person:' + u.name, person)
      }
    }
  }
  const photoOf = (name: string): string | null => (name ? people.get(name)?.photoUrl ?? null : null)
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
  }
  const makeTeam = () => {
    setScope({ kind: 'team' })
    if (/’s tasks$/.test(boardTitle)) setBoardTitle('Team tasks')
    toast('This is now the team board — every task in the file')
  }

  const refresh = () => {
    const n = syncWithStore()
    toast(n ? `Pulled ${n} update${n === 1 ? '' : 's'} from other boards` : 'Up to date with the other boards')
  }

  /**
   * Push the merged store into every other board on this page. Setting another
   * widget instance's synced state re-renders it immediately, so the team board
   * updates the moment a personal board writes (and vice versa). The per-render
   * store merge remains as the fallback for boards that were not reachable.
   */
  const notifyOtherBoards = () => {
    try {
      if (!figma.widgetId) return
      const others = figma.currentPage.findWidgetNodesByWidgetId(figma.widgetId).filter((n) => n.id !== widgetId)
      if (!others.length) return
      const taskMap: Record<string, Task> = {}
      const personMap: Record<string, Person> = {}
      for (const k of figma.root.getSharedPluginDataKeys(NS)) {
        if (k.startsWith('task:')) {
          const v = storeRead<Task>(k)
          if (v && v.id) taskMap[v.id] = v
        } else if (k.startsWith('person:')) {
          const v = storeRead<Person>(k)
          if (v && v.name) personMap[v.name] = v
        }
      }
      const version = Date.now()
      for (const n of others) {
        const prev = (n.widgetSyncedState || {}) as Record<string, unknown>
        const next: Record<string, unknown> = {}
        for (const k of STATE_KEYS) if (k in prev) next[k] = prev[k]
        next.storeVersion = version
        n.setWidgetSyncedState(next, { tasks: taskMap, people: personMap })
      }
    } catch (_) {
      // best effort: the other boards will still merge from the store on their next render
    }
  }

  const findTeammates = () => {
    const before = people.size
    syncPeople()
    const here = figma.activeUsers.filter((u) => u.name).length
    const added = people.size - before
    toast(`${here} ${here === 1 ? 'person is' : 'people are'} in this file right now${added ? ` · ${added} new` : ''}`)
    notifyOtherBoards()
  }

  // ------------------------------------------------------------- mutations
  /** Every write goes to this instance's cache AND the file-wide store. */
  const writeTask = (t: Task) => {
    tasks.set(t.id, t)
    storeWrite('task:' + t.id, t)
  }
  const deleteTask = (id: string) => {
    tasks.delete(id)
    storeWrite('task:' + id, null)
    storeWrite('deleted:' + id, { at: Date.now() })
  }

  /**
   * Two-way merge between this instance's cache and the file store.
   * Newer updatedAt wins per task; tombstones delete; people merge by seenAt.
   * Runs after every render (useEffect) and on the Refresh button.
   */
  const syncWithStore = (): number => {
    let changes = 0
    let keys: string[] = []
    try {
      keys = figma.root.getSharedPluginDataKeys(NS)
    } catch (_) {
      return 0
    }
    const storeTasks = new Map<string, Task>()
    const tomb = new Set<string>()
    const storePeople = new Map<string, Person>()
    for (const k of keys) {
      if (k.startsWith('task:')) {
        const v = storeRead<Task>(k)
        if (v && v.id) storeTasks.set(v.id, v)
      } else if (k.startsWith('deleted:')) tomb.add(k.slice(8))
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
        } else storeWrite('task:' + c.id, c)
      } else if (st.updatedAt < c.updatedAt) storeWrite('task:' + c.id, c)
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
      if (!sp || sp.seenAt < c.seenAt) storeWrite('person:' + c.name, c)
    }
    return changes
  }
  useEffect(() => {
    syncWithStore()
  })

  const patch = (id: string, p: Partial<Task>) => {
    const t = tasks.get(id)
    if (!t) return
    writeTask({ ...t, ...p, updatedAt: Date.now() })
    if (owner && 'assignee' in p && t.assignee === owner && p.assignee !== owner) {
      toast(p.assignee ? `Moved to ${p.assignee}'s board` : 'Unassigned — now only on the team board')
    }
    syncPeople()
    notifyOtherBoards()
  }

  const createTask = (title: string, extra: Partial<Task> = {}) => {
    const clean = title.trim()
    if (!clean) return
    const now = Date.now()
    const t: Task = {
      id: uid(),
      title: clean,
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
    writeTask(t)
    syncPeople()
    toast(`Added “${shortName(clean, 34)}”`)
    notifyOtherBoards()
  }

  /** Completing a task plays a brief check state before the card moves. */
  const complete = (id: string) => {
    const t = tasks.get(id)
    if (!t || t.status === 'done') return
    setCelebrating(id)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        patch(id, { status: 'done', completedAt: Date.now() })
        setCelebrating(null)
        if (openId === id) setOpenId(null)
        toast('✓ Completed — find it in Done')
        resolve()
      }, 600)
    })
  }

  const setStatus = (id: string, status: Status) => {
    const t = tasks.get(id)
    if (!t || t.status === status) return
    if (status === 'done') return complete(id)
    patch(id, { status, completedAt: null })
    toast(`Moved to ${STATUS_LABEL[status]}`)
  }

  const reopen = (id: string) => {
    patch(id, { status: 'todo', completedAt: null, archived: false })
    toast('Reopened in To Do')
  }

  const archive = (id: string, flag: boolean) => {
    patch(id, { archived: flag })
    toast(flag ? 'Archived' : 'Restored')
  }

  const remove = (id: string) => {
    deleteTask(id)
    setConfirmDeleteId(null)
    if (openId === id) setOpenId(null)
    toast('Task deleted')
    notifyOtherBoards()
  }

  const setDiscuss = (id: string, flag: boolean) => {
    patch(id, { discuss: flag })
    toast(flag ? 'Added to the team sync agenda' : 'Removed from the agenda')
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
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' })
    const me = await figma.getNodeByIdAsync(widgetId)
    const anchor = me && 'x' in me ? (me as SceneNode) : null
    const section = figma.createSection()
    section.name = `Team sync · ${weekdayDate(today)}`
    section.fills = [{ type: 'SOLID', color: hexToRgb('#EEF2FF') }]
    const gap = 24
    const cols = 3
    let w = 0
    let h = 0
    flagged.forEach((t, i) => {
      const sticky = figma.createSticky()
      const lines = [t.title]
      const meta = [t.assignee ? `@${t.assignee}` : 'Unassigned', STATUS_LABEL[t.status], t.due ? `due ${dueLabel(t.due)}` : null].filter(Boolean).join(' · ')
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

  const setDue = (id: string, due: string | null) => {
    patch(id, { due })
    toast(due ? `Due ${dueLabel(due)}` : 'Due date cleared')
  }

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
    if (p && p.done && next.length && next.every((s) => s.done)) toast('All subtasks done 🎉')
  }

  /** figma.currentUser may only be read inside event handlers, never while rendering. */
  const myName = (): string | null => {
    syncPeople()
    const name = figma.currentUser?.name
    if (!name) toast('Could not read your Figma name — type a name instead')
    return name ?? null
  }

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters({ ...filters, [key]: value })
  const toggleFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilter(key, (filters[key] === value ? (key === 'stale' ? false : null) : value) as Filters[K])

  const activeFilterCount =
    (filters.assignee ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.due ? 1 : 0) + (filters.status ? 1 : 0) + (filters.stale ? 1 : 0) + (filters.label ? 1 : 0)
  const anyFilter = activeFilterCount > 0 || search.trim().length > 0

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setSearch('')
  }

  const isStale = (t: Task) => t.status === 'todo' && ageInDays(t.createdAt) >= staleDays

  // ---------------------------------------------------------------- filtering
  const q = search.trim().toLowerCase()
  const matches = (t: Task): boolean => {
    if (q) {
      const hay = `${t.title} ${t.description} ${t.assignee} ${labelsOf(t).join(' ')} ${subtasksOf(t).map((s) => s.title).join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.assignee === '__none__' && t.assignee) return false
    if (filters.assignee && filters.assignee !== '__none__' && t.assignee !== filters.assignee) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.status && t.status !== filters.status) return false
    if (filters.stale && !isStale(t)) return false
    if (filters.label && !labelsOf(t).includes(filters.label)) return false
    if (filters.due) {
      if (filters.due === 'none' && t.due) return false
      if (filters.due !== 'none' && !t.due) return false
      if (filters.due === 'overdue' && !(isOverdue(t.due) && t.status !== 'done')) return false
      if (filters.due === 'today' && t.due !== today) return false
      if (filters.due === 'week' && t.due) {
        const d = daysFromToday(t.due)
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

  const knownAssignees = Array.from(new Set([...live.map((t) => t.assignee).filter((a) => a), ...people.keys()])).sort()
  const knownLabels: string[] = Array.from(new Set(live.reduce<string[]>((acc, t) => acc.concat(labelsOf(t)), []))).sort()
  const overdueCount = active.filter((t) => isOverdue(t.due)).length
  const blockedCount = active.filter((t) => t.status === 'blocked').length
  const unassignedCount = active.filter((t) => !t.assignee).length
  const staleCount = active.filter(isStale).length

  // ------------------------------------------------------------ property menu
  usePropertyMenu(
    [
      {
        itemType: 'dropdown',
        propertyName: 'scope',
        tooltip: 'Board scope',
        selectedOption: scope.kind === 'team' ? 'team' : 'mine',
        options: [
          { option: 'team', label: 'Team board (everyone)' },
          { option: 'mine', label: 'My board (only my tasks)' },
        ],
      },
      {
        itemType: 'dropdown',
        propertyName: 'view',
        tooltip: 'View',
        selectedOption: view,
        options: [
          { option: 'board', label: 'Board' },
          { option: 'people', label: 'People' },
          { option: 'week', label: 'Week' },
          { option: 'done', label: 'Done' },
          { option: 'sync', label: 'Team sync' },
        ],
      },
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
      { itemType: 'action', propertyName: 'export', tooltip: 'Export CSV' },
      { itemType: 'action', propertyName: 'agenda', tooltip: 'Create sync agenda on canvas' },
      { itemType: 'action', propertyName: 'expandAll', tooltip: 'Expand all columns' },
      { itemType: 'action', propertyName: 'collapseAll', tooltip: 'Collapse all columns' },
      { itemType: 'action', propertyName: 'clearFilters', tooltip: 'Clear filters' },
      { itemType: 'separator' },
      { itemType: 'action', propertyName: 'archiveOld', tooltip: 'Archive done > 14 days' },
      { itemType: 'action', propertyName: 'samples', tooltip: 'Add sample tasks' },
    ],
    ({ propertyName, propertyValue }) => {
      switch (propertyName) {
        case 'view':
          setView(propertyValue as View)
          break
        case 'scope':
          if (propertyValue === 'mine') makeMine()
          else makeTeam()
          break
        case 'sort':
          setSort(propertyValue as SortMode)
          break
        case 'stale':
          setStaleDays(parseInt(propertyValue as string, 10))
          break
        case 'size':
          setUiSize(propertyValue as string)
          break
        case 'export':
          return exportCsv(all, boardTitle)
        case 'agenda':
          return createAgendaOnCanvas()
        case 'expandAll':
          setCollapsed({})
          break
        case 'collapseAll':
          setCollapsed({ todo: true, inprogress: true, blocked: true, done: true })
          break
        case 'clearFilters':
          clearFilters()
          break
        case 'archiveOld':
          archiveOld()
          break
        case 'samples':
          addSamples()
          break
      }
    },
  )

  const archiveOld = () => {
    let n = 0
    for (const t of done) {
      if (t.completedAt && ageInDays(t.completedAt) >= 14) {
        writeTask({ ...t, archived: true, updatedAt: Date.now() })
        n++
      }
    }
    toast(n ? `Archived ${n} completed task${n === 1 ? '' : 's'}` : 'Nothing older than 14 days to archive')
    if (n) notifyOtherBoards()
  }

  const addSamples = () => {
    const d = (n: number) => addDaysISO(today, n)
    const st = (titles: string[], doneCount = 0): Subtask[] => titles.map((title, i) => ({ id: uid() + i, title, done: i < doneCount }))
    const samples: Array<Partial<Task> & { title: string }> = [
      { title: 'Draft Q4 roadmap outline', status: 'todo', priority: 'high', due: d(1), assignee: 'Maya Chen', labels: ['Roadmap'], subtasks: st(['Collect team input', 'Write first draft', 'Review with leads'], 1) },
      { title: 'Review onboarding copy', status: 'todo', priority: 'medium', due: d(3), labels: ['Website'] },
      { title: 'Collect customer interview notes', status: 'todo', priority: 'low', due: d(-2), assignee: 'Jon Park', labels: ['Research'] },
      { title: 'Prototype billing settings page', status: 'inprogress', priority: 'high', due: d(0), assignee: 'Priya Nair', labels: ['Billing', 'Design'], subtasks: st(['Wireframe', 'Hi-fi mockup', 'Prototype flows', 'Usability test'], 2) },
      { title: 'Update design tokens', status: 'inprogress', priority: 'medium', due: d(5), assignee: 'Maya Chen', labels: ['Design'] },
      { title: 'Waiting on legal: privacy copy', status: 'blocked', priority: 'high', due: d(-1), assignee: 'Jon Park', labels: ['Website'], description: 'Blocked until legal signs off on the new consent wording.' },
      { title: 'Ship notification preferences', status: 'done', priority: 'medium', due: d(-3), assignee: 'Priya Nair', labels: ['Billing'] },
      { title: 'Fix mobile nav overlap', status: 'done', priority: 'high', due: d(-6), assignee: 'Maya Chen', labels: ['Website'] },
    ]
    samples.forEach((s, i) => {
      const now = Date.now() - (samples.length - i) * 1000
      const t: Task = {
        id: uid() + i,
        title: s.title,
        description: s.description ?? '',
        status: s.status ?? 'todo',
        assignee: s.assignee ?? '',
        due: s.due ?? null,
        priority: s.priority ?? null,
        labels: s.labels ?? [],
        subtasks: s.subtasks ?? [],
        createdAt: now - 9 * 86400000 * (i % 2),
        updatedAt: now,
        completedAt: s.status === 'done' ? now - 2 * 86400000 : null,
        archived: false,
      }
      writeTask(t)
    })
    syncPeople()
    toast('Added 8 sample tasks')
    notifyOtherBoards()
  }

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

  function PersonChip({ name, onClick, active }: { name: string; onClick: () => void; active?: boolean }) {
    return (
      <AutoLayout
        direction="horizontal"
        spacing={px(5)}
        padding={{ top: px(2), bottom: px(2), left: px(2), right: px(8) }}
        cornerRadius={px(999)}
        fill={active ? C.accentSoft : C.bg}
        stroke={active ? C.accent : C.border}
        verticalAlignItems="center"
        onClick={onClick}
        hoverStyle={{ fill: C.accentSoft, stroke: C.accent }}
      >
        <Avatar name={name} photo={photoOf(name)} size={16} />
        <Label size={10} weight={600} color={active ? C.accent : C.text}>
          {shortName(name, 18)}
        </Label>
      </AutoLayout>
    )
  }

  // ------------------------------------------------------------------- card
  function Card({ task, width, showStatus }: { task: Task; width: number | 'fill-parent'; showStatus?: boolean }) {
    const open = openId === task.id
    const isCelebrating = celebrating === task.id
    const overdue = isOverdue(task.due) && task.status !== 'done'
    const stale = isStale(task)
    const isDone = task.status === 'done' || isCelebrating
    const stripe = isCelebrating ? C.success : task.status === 'blocked' ? STATUS_COLOR.blocked : overdue ? C.danger : null
    const subs = subtasksOf(task)
    const subsDone = subs.filter((s) => s.done).length
    const labels = labelsOf(task)

    return (
      <AutoLayout
        key={task.id}
        direction="horizontal"
        width={width}
        fill={isCelebrating ? C.successSoft : C.bg}
        cornerRadius={px(8)}
        stroke={open ? C.accent : isCelebrating ? C.success : C.border}
        strokeWidth={open ? 2 : 1}
        hoverStyle={open ? undefined : { stroke: C.borderStrong }}
        overflow="hidden"
        effect={open ? { type: 'drop-shadow', color: { r: 0.31, g: 0.27, b: 0.9, a: 0.18 }, offset: { x: 0, y: 4 }, blur: 14 } : undefined}
      >
        {stripe ? <Rectangle width={px(3)} height="fill-parent" fill={stripe} /> : null}
        <AutoLayout direction="vertical" width="fill-parent" spacing={px(5)} padding={{ vertical: px(7), horizontal: px(9) }}>
          {/* Row 1: check, title, priority */}
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="start">
            <AutoLayout
              width={px(16)}
              height={px(16)}
              cornerRadius={px(8)}
              fill={isDone ? C.success : undefined}
              stroke={isDone ? undefined : C.borderStrong}
              strokeWidth={1.5}
              strokeAlign="inside"
              horizontalAlignItems="center"
              verticalAlignItems="center"
              onClick={() => complete(task.id)}
              hoverStyle={{ fill: isDone ? C.success : C.successSoft, stroke: C.success }}
            >
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
                  if (v && v !== task.title) patch(task.id, { title: v })
                }}
                fontFamily={FONT}
                fontSize={px(13)}
                fontWeight={700}
                fill={C.text}
                width="fill-parent"
                inputBehavior="wrap"
                inputFrameProps={{ padding: 0 }}
              />
            ) : (
              <AutoLayout width="fill-parent" onClick={() => setOpenId(task.id)}>
                <Label size={12} weight={600} width="fill-parent" truncate={2} strike={isDone} color={isDone ? C.muted : C.text}>
                  {task.title || 'Untitled'}
                </Label>
              </AutoLayout>
            )}
            {open ? <IconBtn icon="chevronUp" size={18} tooltip="Collapse" onClick={() => setOpenId(null)} /> : null}
            {task.priority ? (
              <Pill text={PRIORITY_GLYPH[task.priority]} color={PRIORITY_COLOR[task.priority]} fill={PRIORITY_SOFT[task.priority]} tooltip={`${PRIORITY_LABEL[task.priority]} priority`} onClick={() => setOpenId(open ? null : task.id)} />
            ) : null}
          </AutoLayout>

          {/* Labels */}
          {labels.length ? (
            <AutoLayout direction="horizontal" spacing={px(4)} wrap width="fill-parent">
              {labels.slice(0, 3).map((l) => (
                <LabelPill key={l} name={l} onClick={() => setFilter('label', filters.label === l ? null : l)} />
              ))}
              {labels.length > 3 ? (
                <Label size={9} color={C.faint}>
                  {`+${labels.length - 3}`}
                </Label>
              ) : null}
            </AutoLayout>
          ) : null}

          {/* Row 2: avatar, due, subtasks, stale, (status pill), selector */}
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center" wrap>
            <AutoLayout direction="horizontal" spacing={px(4)} verticalAlignItems="center" onClick={() => setOpenId(task.id)} tooltip={task.assignee ? `Assigned to ${task.assignee}` : 'Unassigned — click to assign'}>
              <Avatar name={task.assignee} photo={photoOf(task.assignee)} />
              {task.assignee ? null : (
                <Label size={10} weight={500} color={C.faint} italic>
                  Unassigned
                </Label>
              )}
            </AutoLayout>

            {task.due ? (
              <AutoLayout
                padding={{ vertical: px(1), horizontal: px(6) }}
                cornerRadius={px(999)}
                fill={overdue ? C.dangerSoft : task.due === today ? C.accentSoft : C.surface}
                onClick={() => setOpenId(task.id)}
                hoverStyle={{ fill: overdue ? '#FECACA' : C.surfaceAlt }}
                tooltip={overdue ? `Overdue — was due ${weekdayDate(task.due)}` : `Due ${weekdayDate(task.due)}`}
              >
                <Label size={10} weight={overdue || task.due === today ? 700 : 500} color={overdue ? C.danger : task.due === today ? C.accentText : C.muted}>
                  {overdue ? `Overdue · ${dueLabel(task.due)}` : dueLabel(task.due)}
                </Label>
              </AutoLayout>
            ) : (
              <AutoLayout padding={{ vertical: px(1), horizontal: px(6) }} cornerRadius={px(999)} onClick={() => setDue(task.id, today)} hoverStyle={{ fill: C.surface }} tooltip="No due date — click to set Today">
                <Label size={10} weight={500} color={C.faint}>
                  + date
                </Label>
              </AutoLayout>
            )}

            {subs.length ? (
              <AutoLayout
                direction="horizontal"
                spacing={px(4)}
                padding={{ vertical: px(1), horizontal: px(6) }}
                cornerRadius={px(999)}
                fill={subsDone === subs.length ? C.successSoft : C.surface}
                verticalAlignItems="center"
                onClick={() => setOpenId(task.id)}
                tooltip={`${subsDone} of ${subs.length} subtasks done`}
              >
                <Progress done={subsDone} total={subs.length} width={px(22)} />
                <Label size={10} weight={600} color={subsDone === subs.length ? C.success : C.muted}>
                  {`${subsDone}/${subs.length}`}
                </Label>
              </AutoLayout>
            ) : null}

            {stale && !isDone ? (
              <Pill text={`${ageInDays(task.createdAt)}d old`} color={C.warn} fill={C.warnSoft} size={10} tooltip={`In To Do for ${ageInDays(task.createdAt)} days`} />
            ) : null}

            {task.discuss ? (
              <AutoLayout direction="horizontal" spacing={px(3)} padding={{ vertical: px(1), horizontal: px(6) }} cornerRadius={px(999)} fill={C.accentSoft} verticalAlignItems="center" onClick={() => setView('sync')} tooltip="On the team sync agenda">
                <Icon name="chat" color={C.accentText} size={10} />
                <Label size={10} weight={700} color={C.accentText}>
                  Sync
                </Label>
              </AutoLayout>
            ) : null}

            {showStatus ? (
              <AutoLayout direction="horizontal" spacing={px(4)} padding={{ vertical: px(1), horizontal: px(6) }} cornerRadius={px(999)} fill={STATUS_SOFT[task.status]} verticalAlignItems="center">
                <StatusGlyph status={task.status} size={10} />
                <Label size={10} weight={700} color={STATUS_COLOR[task.status]}>
                  {STATUS_LABEL[task.status]}
                </Label>
              </AutoLayout>
            ) : null}

            {/* one-step status selector */}
            <AutoLayout direction="horizontal" spacing={px(1)} cornerRadius={px(6)} fill={C.surface} padding={px(1)}>
              {STATUSES.map((s) => {
                const current = task.status === s && !isCelebrating
                return (
                  <AutoLayout
                    key={s}
                    width={px(22)}
                    height={px(18)}
                    cornerRadius={px(5)}
                    fill={current ? C.bg : undefined}
                    stroke={current ? C.border : undefined}
                    horizontalAlignItems="center"
                    verticalAlignItems="center"
                    onClick={() => setStatus(task.id, s)}
                    hoverStyle={{ fill: current ? C.bg : STATUS_SOFT[s] }}
                  >
                    <StatusGlyph status={s} size={11} muted={!current} />
                  </AutoLayout>
                )
              })}
            </AutoLayout>
          </AutoLayout>

          {isCelebrating ? (
            <Label size={10} weight={700} color={C.success}>
              ✓ Done! Moving to Completed…
            </Label>
          ) : null}
          {open ? <Editor task={task} /> : null}
        </AutoLayout>
      </AutoLayout>
    )
  }

  // -------------------------------------------------------- inspector panel
  function PropRow({ label, children, stack }: { label: string; children?: any; top?: boolean; stack?: boolean }) {
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

  function Editor({ task }: { task: Task }) {
    const confirming = confirmDeleteId === task.id
    const customDue = !!task.due && task.due !== today && task.due !== tomorrow && task.due !== nextWeek
    const overdue = isOverdue(task.due) && task.status !== 'done'
    const subs = subtasksOf(task)
    const subsDone = subs.filter((s) => s.done).length
    const labels = labelsOf(task)
    const peopleRow = knownAssignees.filter((a) => a !== task.assignee)

    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={px(10)} padding={{ top: px(4) }}>
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

        <Divider />

        <PropRow label="Status">
          <AutoLayout direction="horizontal" spacing={px(1)} cornerRadius={px(8)} fill={C.surface} padding={px(2)}>
            {STATUSES.map((s) => {
              const current = task.status === s
              return (
                <AutoLayout
                  key={s}
                  direction="horizontal"
                  spacing={px(4)}
                  padding={{ vertical: px(3), horizontal: current ? 8 : 6 }}
                  cornerRadius={px(6)}
                  fill={current ? C.bg : undefined}
                  stroke={current ? C.border : undefined}
                  verticalAlignItems="center"
                  onClick={() => setStatus(task.id, s)}
                  hoverStyle={{ fill: current ? C.bg : STATUS_SOFT[s] }}
                  tooltip={current ? `${STATUS_LABEL[s]} (current)` : `Move to ${STATUS_LABEL[s]}`}
                >
                  <StatusGlyph status={s} size={11} muted={!current} />
                  {current ? (
                    <Label size={10} weight={700} color={STATUS_COLOR[s]}>
                      {STATUS_LABEL[s]}
                    </Label>
                  ) : null}
                </AutoLayout>
              )
            })}
          </AutoLayout>
        </PropRow>

        <PropRow label="Due" stack>
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
            <Icon name="calendar" color={task.due ? (overdue ? C.danger : C.accentText) : C.faint} size={12} />
            {task.due ? (
              <Label size={11} weight={700} color={overdue ? C.danger : C.text} width="fill-parent" truncate>
                {overdue ? `Overdue · was due ${weekdayDate(task.due)}` : `Due ${weekdayDate(task.due)}`}
              </Label>
            ) : (
              <Label size={11} color={C.faint} italic width="fill-parent">
                No due date
              </Label>
            )}
            {task.due ? <Btn small tone="ghost" icon="x" label="Clear" onClick={() => setDue(task.id, null)} /> : null}
          </AutoLayout>
          <AutoLayout direction="horizontal" spacing={px(4)} wrap width="fill-parent">
            <Chip small label="Today" active={task.due === today} onClick={() => setDue(task.id, today)} />
            <Chip small label="Tomorrow" active={task.due === tomorrow} onClick={() => setDue(task.id, tomorrow)} />
            <Chip small label="Next week" active={task.due === nextWeek} onClick={() => setDue(task.id, nextWeek)} />
            <Chip small label={customDue ? weekdayDate(task.due as string) : 'Pick date…'} active={customDue} onClick={() => pickDate(task.title, task.due, (iso) => setDue(task.id, iso))} />
          </AutoLayout>
        </PropRow>

        <PropRow label="Owner" stack>
          <AutoLayout direction="horizontal" spacing={px(6)} verticalAlignItems="center" width="fill-parent">
            <Avatar name={task.assignee} photo={photoOf(task.assignee)} size={22} />
            <Input
              value={task.assignee || null}
              placeholder="Type a name, press Enter"
              onTextEditEnd={(e) => {
                const v = resolvePerson(e.characters)
                if (v !== task.assignee) patch(task.id, { assignee: v })
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
              label="Me"
              tooltip="Assign to me"
              onClick={() => {
                const name = myName()
                if (name) patch(task.id, { assignee: task.assignee === name ? '' : name })
              }}
            />
            <IconBtn icon="users" tooltip="Find teammates who are in this file right now" onClick={findTeammates} />
          </AutoLayout>
          {peopleRow.length ? (
            <AutoLayout direction="horizontal" spacing={px(4)} wrap width="fill-parent" verticalAlignItems="center">
              {peopleRow.map((a) => (
                <PersonChip key={a} name={a} onClick={() => patch(task.id, { assignee: a })} />
              ))}
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

        <PropRow label="Labels">
          {knownLabels.map((l) => (
            <LabelPill key={l} name={l} size={10} active={labels.includes(l)} onClick={() => toggleLabel(task.id, l)} />
          ))}
          <Input
            value={null}
            placeholder="+ label"
            onTextEditEnd={(e) => {
              const v = resolveLabel(e.characters)
              if (v && !labels.includes(v)) toggleLabel(task.id, v)
            }}
            fontFamily={FONT}
            fontSize={px(10)}
            fontWeight={600}
            fill={C.text}
            placeholderProps={{ fill: C.faint }}
            width={px(80)}
            inputBehavior="truncate"
            inputFrameProps={{ padding: { vertical: px(2), horizontal: px(7) }, cornerRadius: px(4), stroke: C.border, strokeDashPattern: [3, 2] }}
          />
        </PropRow>

        <PropRow label="Team sync" stack>
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
            <Chip
              small
              label={task.discuss ? 'On the agenda' : 'Discuss in team sync'}
              lead={<Icon name="chat" color={task.discuss ? C.accent : C.muted} size={11} />}
              active={!!task.discuss}
              onClick={() => setDiscuss(task.id, !task.discuss)}
            />
            {task.discuss ? <Btn small tone="ghost" icon="chat" label="Open agenda" onClick={() => setView('sync')} /> : null}
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
            <Label size={10} weight={600} color={C.muted}>
              Subtasks
            </Label>
            {subs.length ? (
              <Label size={10} weight={700} color={subsDone === subs.length ? C.success : C.text}>
                {`${subsDone}/${subs.length}`}
              </Label>
            ) : null}
            <AutoLayout width="fill-parent" height={px(1)} />
            {subs.length ? <Progress done={subsDone} total={subs.length} width={px(90)} /> : null}
          </AutoLayout>
          {subs.map((s) => (
            <AutoLayout key={s.id} direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center" padding={{ vertical: px(2) }} hoverStyle={{ fill: C.canvas }} cornerRadius={px(4)}>
              <AutoLayout
                width={px(14)}
                height={px(14)}
                cornerRadius={px(4)}
                fill={s.done ? C.success : undefined}
                stroke={s.done ? undefined : C.borderStrong}
                strokeWidth={1.5}
                strokeAlign="inside"
                horizontalAlignItems="center"
                verticalAlignItems="center"
                onClick={() => patchSubtask(task.id, s.id, { done: !s.done })}
                hoverStyle={{ fill: s.done ? C.success : C.successSoft, stroke: C.success }}
                tooltip={s.done ? 'Mark not done' : 'Mark done'}
              >
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
                inputFrameProps={{ padding: px(0) }}
              />
              <IconBtn icon="x" size={16} tooltip="Remove subtask" onClick={() => patchSubtask(task.id, s.id, null)} />
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

        <AutoLayout direction="horizontal" width="fill-parent" verticalAlignItems="center" spacing={px(4)}>
          <Label size={9} color={C.faint} width="fill-parent" truncate>
            {`Created ${fromTimestamp(task.createdAt)}${task.completedAt ? ` · Done ${fromTimestamp(task.completedAt)}` : ''}`}
          </Label>
          <Btn small tone="ghost" icon="archive" tooltip="Archive (keeps the task, hides it from views)" onClick={() => archive(task.id, true)} />
          {confirming ? (
            <Btn small tone="danger" icon="trash" label="Confirm delete" onClick={() => remove(task.id)} />
          ) : (
            <Btn small tone="ghost" icon="trash" tooltip="Delete permanently" onClick={() => setConfirmDeleteId(task.id)} />
          )}
          <Btn small tone="ghost" icon="chevronUp" tooltip="Collapse" onClick={() => setOpenId(null)} />
        </AutoLayout>
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- column
  function Column({ status }: { status: Status }) {
    const isCollapsed = !!collapsed[status]
    const items = live.filter((t) => t.status === status)
    // Done column: most recently completed first; other columns use the chosen sort.
    const visible = items.filter(matches).sort(status === 'done' ? (a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt) : compare)
    const color = STATUS_COLOR[status]
    const hiddenByFilter = items.length - visible.length

    if (isCollapsed) {
      return (
        <AutoLayout
          key={status}
          direction="vertical"
          width={COLLAPSED_W}
          spacing={px(8)}
          padding={{ vertical: px(10), horizontal: px(4) }}
          fill={STATUS_TINT[status]}
          cornerRadius={px(12)}
          horizontalAlignItems="center"
          onClick={() => setCollapsed({ ...collapsed, [status]: false })}
          hoverStyle={{ fill: STATUS_SOFT[status] }}
          tooltip={`Expand ${STATUS_LABEL[status]} (${items.length})`}
        >
          <Rectangle width={px(20)} height={px(3)} cornerRadius={px(2)} fill={color} />
          <StatusGlyph status={status} size={14} />
          <Pill text={String(items.length)} color={color} fill={C.bg} size={10} />
          <AutoLayout direction="vertical" spacing={px(-1)} horizontalAlignItems="center" padding={{ top: px(2) }}>
            {STATUS_SHORT[status].split('').map((ch, i) => (
              <Label key={i} size={9} weight={700} color={color}>
                {ch}
              </Label>
            ))}
          </AutoLayout>
        </AutoLayout>
      )
    }

    return (
      <AutoLayout key={status} direction="vertical" width={COL_W} spacing={0} fill={STATUS_TINT[status]} cornerRadius={px(12)} overflow="hidden">
        <Rectangle width="fill-parent" height={px(4)} fill={color} />
        <AutoLayout direction="vertical" width="fill-parent" spacing={px(8)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
          <StatusGlyph status={status} size={13} />
          <Label size={12} weight={700} color={C.text}>
            {STATUS_LABEL[status]}
          </Label>
          <Pill text={String(visible.length)} color={color} fill={C.bg} size={10} />
          {hiddenByFilter > 0 ? (
            <Label size={9} color={C.faint}>
              {`+${hiddenByFilter} filtered`}
            </Label>
          ) : null}
          <AutoLayout width="fill-parent" height={px(1)} />
          <IconBtn icon="chevronDown" tooltip="Collapse column" onClick={() => setCollapsed({ ...collapsed, [status]: true })} />
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
            <Btn label={visible.length > 5 ? `${visible.length - 5} more in Done view` : 'Open Done view'} icon="chevronRight" tone="ghost" small onClick={() => setView('done')} />
          </AutoLayout>
        ) : (
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)}>
            {status === 'todo' && quickAddOpen ? <Composer /> : null}
            {visible.map((t) => (
              <Card key={t.id} task={t} width="fill-parent" />
            ))}
            {visible.length === 0 && !(status === 'todo' && quickAddOpen) ? (
              <AutoLayout width="fill-parent" padding={{ vertical: px(4), horizontal: px(4) }}>
                <Label size={10} color={C.faint} italic>
                  {items.length > 0 ? 'No matches for current filters.' : status === 'todo' && live.length === 0 ? 'Type below to add your first task.' : 'Nothing here.'}
                </Label>
              </AutoLayout>
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
    return (
      <AutoLayout
        key={task.id}
        direction="vertical"
        width="fill-parent"
        spacing={0}
        fill={C.bg}
        cornerRadius={px(8)}
        stroke={open ? C.accent : C.border}
        strokeWidth={open ? 2 : 1}
        hoverStyle={open ? undefined : { stroke: C.borderStrong }}
      >
      <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} padding={{ vertical: px(5), horizontal: px(8) }} verticalAlignItems="center">
        {task.archived ? <Icon name="archive" color={C.faint} size={13} /> : <StatusGlyph status="done" size={14} />}
        <AutoLayout direction="vertical" width="fill-parent" spacing={px(1)} onClick={() => setOpenId(open ? null : task.id)} tooltip="Open details">
          <Label size={11} weight={500} color={C.muted} strike={!task.archived} width="fill-parent" truncate>
            {task.title}
          </Label>
          {compact ? null : (
            <Label size={9} color={C.faint} width="fill-parent" truncate>
              {[
                task.assignee ? task.assignee : 'Unassigned',
                task.due ? `due ${weekdayDate(task.due)}` : null,
                task.completedAt ? `completed ${fromTimestamp(task.completedAt)}` : null,
                task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null,
                labelsOf(task).length ? labelsOf(task).join(', ') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Label>
          )}
        </AutoLayout>
        {compact ? (
          <Label size={9} color={C.faint}>
            {task.completedAt ? fromTimestamp(task.completedAt) : ''}
          </Label>
        ) : (
          <Avatar name={task.assignee} photo={photoOf(task.assignee)} size={16} />
        )}
        <IconBtn icon="undo" tooltip="Reopen in To Do" onClick={() => reopen(task.id)} />
        {compact ? null : task.archived ? (
          <IconBtn icon="archive" tooltip="Restore from archive" color={C.accent} onClick={() => archive(task.id, false)} />
        ) : (
          <IconBtn icon="archive" tooltip="Archive" onClick={() => archive(task.id, true)} />
        )}
        {!compact && task.archived ? (
          confirmDeleteId === task.id ? (
            <Btn small tone="danger" icon="trash" label="Confirm" onClick={() => remove(task.id)} />
          ) : (
            <IconBtn icon="trash" tooltip="Delete permanently" onClick={() => setConfirmDeleteId(task.id)} />
          )
        ) : null}
      </AutoLayout>
      {open ? (
        <AutoLayout width="fill-parent" padding={{ top: 0, bottom: px(8), left: px(10), right: px(10) }}>
          <Editor task={task} />
        </AutoLayout>
      ) : null}
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
    const pool = active.filter(matches).sort(compare)
    const groups: Array<{ key: string; title: string; sub?: string; items: Task[]; color: string; tint: string }> = []
    const overdue = pool.filter((t) => t.due && daysFromToday(t.due) < 0)
    if (overdue.length) groups.push({ key: 'overdue', title: 'Overdue', items: overdue, color: C.danger, tint: '#FFF1F1' })
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(today, i)
      const items = pool.filter((t) => t.due === iso)
      groups.push({
        key: iso,
        title: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayDate(iso).split(',')[0],
        sub: weekdayDate(iso),
        items,
        color: i === 0 ? C.accent : C.muted,
        tint: i === 0 ? C.accentSoft : C.surface,
      })
    }
    const later = pool.filter((t) => t.due && daysFromToday(t.due) > 6)
    if (later.length) groups.push({ key: 'later', title: 'Later', items: later, color: C.muted, tint: C.surface })
    const undated = pool.filter((t) => !t.due)
    groups.push({ key: 'none', title: 'No due date', sub: 'Click “+ date” on a card to schedule it', items: undated, color: C.muted, tint: C.canvas })

    return (
      <AutoLayout direction="vertical" spacing={px(8)} width={BOARD_W}>
        {groups.map((g) => (
          <AutoLayout key={g.key} direction="horizontal" width="fill-parent" spacing={px(10)} padding={px(10)} fill={g.tint} cornerRadius={px(12)} verticalAlignItems="start">
            <AutoLayout direction="vertical" width={px(118)} spacing={px(2)}>
              <AutoLayout direction="horizontal" spacing={px(6)} verticalAlignItems="center">
                <Label size={12} weight={700} color={g.color}>
                  {g.title}
                </Label>
                <Pill text={String(g.items.length)} color={g.color} fill={C.bg} size={10} />
              </AutoLayout>
              {g.sub ? (
                <Label size={9} color={C.faint} width="fill-parent">
                  {g.sub}
                </Label>
              ) : null}
            </AutoLayout>
            {g.items.length ? (
              <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} wrap verticalAlignItems="start">
                {g.items.map((t) => (
                  <Card key={t.id} task={t} width={CARD_W} showStatus />
                ))}
              </AutoLayout>
            ) : (
              <AutoLayout width="fill-parent" padding={{ vertical: px(2) }}>
                <Label size={10} color={C.faint} italic>
                  Nothing scheduled.
                </Label>
              </AutoLayout>
            )}
          </AutoLayout>
        ))}
      </AutoLayout>
    )
  }

  function DoneView() {
    const dq = doneSearch.trim().toLowerCase()
    const pool = (showArchived ? all.filter((t) => t.archived || t.status === 'done') : done)
      .filter(matches)
      .filter((t) => !dq || `${t.title} ${t.description} ${t.assignee} ${labelsOf(t).join(' ')}`.toLowerCase().includes(dq))
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))

    return (
      <AutoLayout direction="vertical" spacing={px(8)} width={BOARD_W}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center">
          <AutoLayout direction="horizontal" spacing={px(6)} verticalAlignItems="center" padding={{ vertical: px(5), horizontal: px(9) }} fill={C.surface} cornerRadius={px(8)} width={px(260)}>
            <Icon name="search" color={C.faint} size={12} />
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
              inputFrameProps={{ padding: px(0) }}
            />
            {doneSearch ? <IconBtn icon="x" size={16} tooltip="Clear search" onClick={() => setDoneSearch('')} /> : null}
          </AutoLayout>
          <Chip label={`Show archived (${archived.length})`} active={showArchived} onClick={() => setShowArchived(!showArchived)} />
          <AutoLayout width="fill-parent" height={px(1)} />
          <Btn small label="Archive done > 14 days" icon="archive" onClick={archiveOld} tooltip="Move completed tasks older than 14 days to the archive" />
        </AutoLayout>

        <AutoLayout direction="vertical" width="fill-parent" spacing={0} fill={STATUS_TINT.done} cornerRadius={px(12)} overflow="hidden">
          <Rectangle width="fill-parent" height={px(4)} fill={STATUS_COLOR.done} />
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
            <StatusGlyph status="done" size={13} />
            <Label size={12} weight={700}>
              {showArchived ? 'Completed & archived' : 'Completed'}
            </Label>
            <Pill text={String(pool.length)} color={C.success} fill={C.bg} size={10} />
          </AutoLayout>
          {pool.length ? (
            pool.map((t) => <DoneRow key={t.id} task={t} />)
          ) : (
            <Label size={10} color={C.faint} italic>
              {dq || anyFilter ? 'No completed tasks match.' : 'No completed tasks yet — click a card’s circle to mark it done.'}
            </Label>
          )}
          </AutoLayout>
        </AutoLayout>
      </AutoLayout>
    )
  }

  function PeopleView() {
    const pool = active.filter(matches)
    const names = Array.from(new Set(pool.map((t) => t.assignee))).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    return (
      <AutoLayout direction="horizontal" spacing={COL_GAP} wrap width={BOARD_W} verticalAlignItems="start">
        {names.length === 0 ? (
          <Label size={10} color={C.faint} italic>
            No active tasks.
          </Label>
        ) : null}
        {names.map((name) => {
          const items = pool.filter((t) => t.assignee === name).sort(compare)
          const od = items.filter((t) => isOverdue(t.due)).length
          const [bg, fg] = name ? avatarColors(name) : [C.surface, C.muted]
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
                  <Pill text={String(items.length)} color={fg} fill={bg} size={10} />
                </AutoLayout>
                {items.map((t) => (
                  <Card key={t.id} task={t} width="fill-parent" showStatus />
                ))}
              </AutoLayout>
            </AutoLayout>
          )
        })}
      </AutoLayout>
    )
  }

  function SyncView() {
    const agenda = live.filter((t) => t.discuss).filter(matches).sort(compare)
    return (
      <AutoLayout direction="vertical" spacing={px(8)} width={BOARD_W}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} verticalAlignItems="center">
          <Label size={11} color={C.muted} width="fill-parent">
            Flag any task with “Discuss in team sync”. Before the meeting, drop the agenda onto the canvas as stickies and work through it there.
          </Label>
          {agenda.length ? <Btn small tone="ghost" icon="x" label="Clear agenda" onClick={() => agenda.forEach((t) => patch(t.id, { discuss: false }))} /> : null}
          <Btn label="Create agenda on canvas" icon="sticky" tone="primary" onClick={createAgendaOnCanvas} tooltip="Creates a dated section with one sticky per flagged task next to the board" />
        </AutoLayout>
        <AutoLayout direction="vertical" width="fill-parent" spacing={0} fill={C.accentSoft} cornerRadius={px(12)} overflow="hidden">
          <Rectangle width="fill-parent" height={px(4)} fill={C.accent} />
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(6)} padding={{ top: px(8), bottom: px(10), left: px(10), right: px(10) }}>
            <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="center">
              <Icon name="chat" color={C.accent} size={13} />
              <Label size={12} weight={700}>
                {`Team sync agenda · ${weekdayDate(today)}`}
              </Label>
              <Pill text={String(agenda.length)} color={C.accent} fill={C.bg} size={10} />
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
    const overdue = isOverdue(task.due) && task.status !== 'done'
    return (
      <AutoLayout key={task.id} direction="vertical" width="fill-parent" spacing={0} fill={C.bg} cornerRadius={px(8)} stroke={open ? C.accent : C.border} strokeWidth={open ? 2 : 1} hoverStyle={open ? undefined : { stroke: C.borderStrong }}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(8)} padding={{ vertical: px(6), horizontal: px(8) }} verticalAlignItems="start">
          <AutoLayout
            width={px(16)}
            height={px(16)}
            cornerRadius={px(4)}
            stroke={C.accent}
            strokeWidth={1.5}
            strokeAlign="inside"
            horizontalAlignItems="center"
            verticalAlignItems="center"
            onClick={() => setDiscuss(task.id, false)}
            hoverStyle={{ fill: C.accentSoft }}
            tooltip="Discussed — remove from agenda"
          />
          <AutoLayout direction="vertical" width="fill-parent" spacing={px(3)}>
            <AutoLayout width="fill-parent" onClick={() => setOpenId(open ? null : task.id)}>
              <Label size={12} weight={600} width="fill-parent" truncate={2}>
                {task.title}
              </Label>
            </AutoLayout>
            <AutoLayout direction="horizontal" spacing={px(6)} wrap verticalAlignItems="center" width="fill-parent">
              <AutoLayout direction="horizontal" spacing={px(4)} padding={{ vertical: px(1), horizontal: px(6) }} cornerRadius={px(999)} fill={STATUS_SOFT[task.status]} verticalAlignItems="center">
                <StatusGlyph status={task.status} size={10} />
                <Label size={10} weight={700} color={STATUS_COLOR[task.status]}>
                  {STATUS_LABEL[task.status]}
                </Label>
              </AutoLayout>
              <AutoLayout direction="horizontal" spacing={px(4)} verticalAlignItems="center">
                <Avatar name={task.assignee} photo={photoOf(task.assignee)} size={16} />
                <Label size={10} weight={500} color={task.assignee ? C.text : C.faint} italic={!task.assignee}>
                  {task.assignee ? shortName(task.assignee, 20) : 'Unassigned'}
                </Label>
              </AutoLayout>
              {task.due ? (
                <Label size={10} weight={overdue ? 700 : 500} color={overdue ? C.danger : C.muted}>
                  {overdue ? `Overdue · ${dueLabel(task.due)}` : dueLabel(task.due)}
                </Label>
              ) : null}
              {labelsOf(task).map((l) => (
                <LabelPill key={l} name={l} />
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
          <IconBtn icon={open ? 'chevronUp' : 'chevronDown'} tooltip={open ? 'Collapse' : 'Edit task'} onClick={() => setOpenId(open ? null : task.id)} />
        </AutoLayout>
        {open ? (
          <AutoLayout width="fill-parent" padding={{ top: 0, bottom: px(8), left: px(10), right: px(10) }}>
            <Editor task={task} />
          </AutoLayout>
        ) : null}
      </AutoLayout>
    )
  }

  // ---------------------------------------------------------------- panels
  /** New-task composer, rendered as a card at the top of the To Do column. */
  function Composer() {
    const customDue = !!draft.due && draft.due !== today && draft.due !== tomorrow && draft.due !== nextWeek
    const assignee = draft.assignee || owner || ''
    return (
      <AutoLayout
        direction="vertical"
        width="fill-parent"
        spacing={px(6)}
        padding={{ vertical: px(8), horizontal: px(9) }}
        fill={C.bg}
        cornerRadius={px(8)}
        stroke={C.accent}
        strokeWidth={2}
        effect={{ type: 'drop-shadow', color: { r: 0.31, g: 0.27, b: 0.9, a: 0.18 }, offset: { x: 0, y: 4 }, blur: 14 }}
      >
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(6)} verticalAlignItems="start">
          <AutoLayout width={px(16)} height={px(16)} cornerRadius={px(8)} stroke={C.borderStrong} strokeWidth={1.5} strokeAlign="inside" />
          <Input
            value={null}
            placeholder="Task title, press Enter"
            onTextEditEnd={(e) => createTask(e.characters, { status: 'todo', priority: draft.priority, due: draft.due, assignee, labels: draft.label ? [draft.label] : [] })}
            fontFamily={FONT}
            fontSize={px(13)}
            fontWeight={600}
            fill={C.text}
            placeholderProps={{ fill: C.faint, fontWeight: 400 }}
            width="fill-parent"
            inputBehavior="wrap"
            inputFrameProps={{ padding: 0 }}
          />
          <IconBtn icon="x" size={18} tooltip="Close" onClick={() => setQuickAddOpen(false)} />
        </AutoLayout>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(4)} wrap verticalAlignItems="center">
          <Chip small label="Today" active={draft.due === today} onClick={() => setDraft({ ...draft, due: draft.due === today ? null : today })} />
          <Chip small label="Tomorrow" active={draft.due === tomorrow} onClick={() => setDraft({ ...draft, due: draft.due === tomorrow ? null : tomorrow })} />
          <Chip small label="Next week" active={draft.due === nextWeek} onClick={() => setDraft({ ...draft, due: draft.due === nextWeek ? null : nextWeek })} />
          <Chip small label={customDue ? weekdayDate(draft.due as string) : 'Pick…'} active={customDue} onClick={() => pickDate('New task', draft.due, (iso) => setDraft({ ...draft, due: iso }))} />
        </AutoLayout>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(4)} wrap verticalAlignItems="center">
          {PRIORITIES.map((p) => (
            <Chip key={p} small label={PRIORITY_GLYPH[p]} active={draft.priority === p} color={PRIORITY_COLOR[p]} soft={PRIORITY_SOFT[p]} onClick={() => setDraft({ ...draft, priority: draft.priority === p ? null : p })} />
          ))}
        </AutoLayout>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={px(4)} verticalAlignItems="center">
          <Avatar name={assignee} photo={photoOf(assignee)} size={18} />
          <Input
            value={assignee || null}
            placeholder="Assignee"
            onTextEditEnd={(e) => setDraft({ ...draft, assignee: resolvePerson(e.characters) })}
            fontFamily={FONT}
            fontSize={px(10)}
            fontWeight={600}
            fill={C.text}
            placeholderProps={{ fill: C.faint, italic: true }}
            width="fill-parent"
            inputBehavior="truncate"
            inputFrameProps={{ padding: { vertical: px(3), horizontal: px(8) }, fill: C.surface, cornerRadius: px(999) }}
          />
          <Chip
            small
            label="Me"
            tooltip="Assign to me"
            onClick={() => {
              const name = myName()
              if (name) setDraft({ ...draft, assignee: draft.assignee === name ? '' : name })
            }}
          />
        </AutoLayout>
        {knownLabels.length ? (
          <AutoLayout direction="horizontal" width="fill-parent" spacing={px(4)} wrap verticalAlignItems="center">
            {knownLabels.slice(0, 6).map((l) => (
              <LabelPill key={l} name={l} size={10} active={draft.label === l} onClick={() => setDraft({ ...draft, label: draft.label === l ? null : l })} />
            ))}
          </AutoLayout>
        ) : null}
        <Label size={9} color={C.faint}>
          Enter adds the task and keeps this open for the next one.
        </Label>
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
            <Chip small label={`Stale ${staleDays}d+ (${staleCount})`} color={C.warn} soft={C.warnSoft} active={filters.stale} onClick={() => setFilter('stale', !filters.stale)} tooltip={`In To Do for ${staleDays}+ days`} />
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
              <Chip key={s} small label={STATUS_LABEL[s]} lead={<StatusGlyph status={s} size={10} muted={filters.status !== s} />} color={STATUS_COLOR[s]} soft={STATUS_SOFT[s]} active={filters.status === s} onClick={() => toggleFilter('status', s)} />
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
                  <AutoLayout
                    key={a}
                    direction="horizontal"
                    spacing={px(4)}
                    padding={{ vertical: px(1), horizontal: px(1) }}
                    cornerRadius={px(999)}
                    fill={filters.assignee === a ? C.accentSoft : undefined}
                    stroke={filters.assignee === a ? C.accent : undefined}
                    verticalAlignItems="center"
                    onClick={() => toggleFilter('assignee', a)}
                    hoverStyle={{ fill: C.accentSoft }}
                    tooltip={a}
                  >
                    <Avatar name={a} photo={photoOf(a)} size={20} />
                    {filters.assignee === a ? (
                      <AutoLayout padding={{ right: px(6) }}>
                        <Label size={10} weight={700} color={C.accent}>
                          {shortName(a)}
                        </Label>
                      </AutoLayout>
                    ) : null}
                  </AutoLayout>
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
            <Btn small tone="ghost" icon="x" label="Clear all" onClick={clearFilters} />
          </AutoLayout>
        ) : null}
      </AutoLayout>
    )
  }

  function FilterGroup({ label, children }: { label: string; children?: any }) {
    return (
      <AutoLayout direction="horizontal" spacing={px(4)} verticalAlignItems="center">
        <AutoLayout padding={{ right: px(2) }}>
          <Label size={9} weight={700} color={C.faint}>
            {label.toUpperCase()}
          </Label>
        </AutoLayout>
        {children}
      </AutoLayout>
    )
  }

  function ViewTab({ id, label, iconName, count }: { id: View; label: string; iconName: IconName; count?: number }) {
    const on = view === id
    return (
      <AutoLayout
        direction="horizontal"
        spacing={px(5)}
        padding={{ vertical: px(5), horizontal: px(12) }}
        cornerRadius={px(7)}
        fill={on ? C.bg : undefined}
        verticalAlignItems="center"
        onClick={() => setView(id)}
        hoverStyle={{ fill: on ? C.bg : C.surfaceAlt }}
        effect={on ? { type: 'drop-shadow', color: { r: 0, g: 0, b: 0, a: 0.08 }, offset: { x: 0, y: 1 }, blur: 2 } : undefined}
      >
        <Icon name={iconName} color={on ? C.accent : C.muted} size={11} />
        <Label size={11} weight={on ? 700 : 500} color={on ? C.text : C.muted}>
          {label}
        </Label>
        {count !== undefined && count > 0 ? <Pill text={String(count)} color={id === 'sync' ? C.accent : on ? C.success : C.muted} fill={id === 'sync' ? C.accentSoft : on ? C.successSoft : C.surfaceAlt} /> : null}
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- header
  const agendaCount = live.filter((t) => t.discuss).length
  void storeVersion
  const mainView = view === 'board' || (view === 'people' && owner) ? <BoardView /> : view === 'week' ? <WeekView /> : view === 'sync' ? <SyncView /> : view === 'people' ? <PeopleView /> : <DoneView />

  return (
    <AutoLayout
      direction="vertical"
      spacing={px(10)}
      padding={px(14)}
      fill={C.bg}
      cornerRadius={px(16)}
      stroke={C.border}
      strokeWidth={1}
      width="hug-contents"
      effect={{ type: 'drop-shadow', color: { r: 0.07, g: 0.09, b: 0.15, a: 0.08 }, offset: { x: 0, y: 4 }, blur: 16 }}
    >
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
          inputFrameProps={{ padding: px(0) }}
        />
        <AutoLayout direction="horizontal" spacing={px(4)} verticalAlignItems="center">
          <Pill text={owner ? 'My board' : 'Team board'} color={owner ? C.accent : C.muted} fill={owner ? C.accentSoft : C.surface} size={10} tooltip={owner ? `Shows only tasks assigned to ${owner}` : 'Shows every task in this file'} />
          <Pill text={`${active.length} active`} color={C.muted} fill={C.surface} size={10} />
          {overdueCount ? <Pill text={`${overdueCount} overdue`} color={C.danger} fill={C.dangerSoft} size={10} onClick={() => setFilter('due', filters.due === 'overdue' ? null : 'overdue')} tooltip="Filter overdue" /> : null}
          {blockedCount ? <Pill text={`${blockedCount} blocked`} color={STATUS_COLOR.blocked} fill={STATUS_SOFT.blocked} size={10} /> : null}
          {unassignedCount ? <Pill text={`${unassignedCount} unassigned`} color={C.muted} fill={C.surface} size={10} onClick={() => setFilter('assignee', filters.assignee === '__none__' ? null : '__none__')} tooltip="Filter unassigned" /> : null}
        </AutoLayout>
        <AutoLayout width="fill-parent" height={px(1)} />
        <Btn
          small
          tone="ghost"
          icon={owner ? 'users' : 'user'}
          label={owner ? 'Switch to team board' : 'Make this my board'}
          onClick={owner ? makeTeam : makeMine}
          tooltip={owner ? 'Show every task in the file again' : 'Show only tasks assigned to you. Duplicate the widget first if the team still needs this one.'}
        />
        <Btn
          label="Add task"
          icon="plus"
          tone={quickAddOpen ? 'default' : 'primary'}
          onClick={() => {
            const next = !quickAddOpen
            setQuickAddOpen(next)
            if (next && collapsed.todo) setCollapsed({ ...collapsed, todo: false })
          }}
          tooltip="Opens a new task card at the top of To Do (or type directly into any column)"
        />
      </AutoLayout>

      {/* Row 2: navigation + search/filter */}
      <AutoLayout direction="horizontal" width={BOARD_W} spacing={px(10)} verticalAlignItems="center">
        <AutoLayout direction="horizontal" spacing={px(2)} padding={px(3)} fill={C.surface} cornerRadius={px(9)}>
          <ViewTab id="board" label="Board" iconName="board" />
          <ViewTab id="week" label="Week" iconName="week" />
          <ViewTab id="done" label="Done" iconName="check" count={done.length} />
          <ViewTab id="sync" label="Sync" iconName="chat" count={agendaCount} />
          {owner ? null : <ViewTab id="people" label="People" iconName="users" />}
        </AutoLayout>
        <AutoLayout width="fill-parent" height={px(1)} />
        <AutoLayout direction="horizontal" spacing={px(6)} verticalAlignItems="center" padding={{ vertical: px(6), horizontal: px(10) }} fill={C.surface} stroke={search ? C.accent : undefined} cornerRadius={px(8)} width={px(220)}>
          <Icon name="search" color={search ? C.accent : C.faint} size={12} />
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
            inputFrameProps={{ padding: px(0) }}
          />
          {search ? <IconBtn icon="x" size={16} tooltip="Clear search" onClick={() => setSearch('')} /> : null}
        </AutoLayout>
        <Btn
          label={activeFilterCount ? `Filters · ${activeFilterCount}` : 'Filters'}
          icon="filter"
          tone={filtersOpen || activeFilterCount ? 'primary' : 'default'}
          onClick={() => setFiltersOpen(!filtersOpen)}
          tooltip="Filter by label, person, priority, due date, status"
        />
        <Btn icon="refresh" onClick={refresh} tooltip="Pull changes made on other boards in this file" />
        <Btn icon="download" onClick={() => exportCsv(all, boardTitle)} tooltip={owner ? 'Export my tasks as CSV' : 'Export all tasks as CSV'} />
      </AutoLayout>

      {quickAddOpen && view !== 'board' ? (
        <AutoLayout width={COL_W}>
          <Composer />
        </AutoLayout>
      ) : null}
      {filtersOpen ? <FilterPanel /> : null}

      {live.length === 0 ? (
        <AutoLayout direction="horizontal" width={BOARD_W} spacing={px(8)} padding={{ vertical: px(8), horizontal: px(10) }} fill={C.surface} cornerRadius={px(10)} verticalAlignItems="center">
          <Label size={11} color={C.muted} width="fill-parent">
            Empty board. Type a title into any column, use “Add task”, or load a few sample tasks to see how it works.
          </Label>
          <Btn small label="Load sample tasks" onClick={addSamples} />
        </AutoLayout>
      ) : null}

      {/* body: main view + optional inspector on the right */}
      {mainView}
    </AutoLayout>
  )
}

widget.register(Widget)
