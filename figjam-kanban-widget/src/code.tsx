import {
  ACTIVE_STATUSES,
  Draft,
  EMPTY_FILTERS,
  Filters,
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  SortMode,
  STATUSES,
  STATUS_LABEL,
  STATUS_SHORT,
  Status,
  Task,
  View,
} from './types'
import { addDaysISO, ageInDays, daysFromToday, dueLabel, fromTimestamp, isOverdue, nextMondayISO, todayISO, weekdayDate } from './dates'
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
} from './theme'

const { widget } = figma
const { AutoLayout, Text, Input, SVG, Ellipse, Rectangle, useSyncedState, useSyncedMap, usePropertyMenu } = widget

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const COL_W = 252
const COL_GAP = 10
const BOARD_W = COL_W * 4 + COL_GAP * 3
const COLLAPSED_W = 40
const CARD_W = COL_W - 20
const FONT = 'Inter'

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const toast = (msg: string) => figma.notify(msg, { timeout: 1400 })
const shortName = (s: string) => (s.length > 14 ? s.slice(0, 13) + '…' : s)

// ---------------------------------------------------------------------------
// Primitive-based glyphs (no SVG → cheap to re-render)
// ---------------------------------------------------------------------------
function Icon({ name, color, size = 12 }: { name: IconName; color: string; size?: number }) {
  return <SVG src={icon(name, color, size)} width={size} height={size} />
}

/** Status glyph drawn with frames/ellipse/text instead of SVG. */
function StatusGlyph({ status, size = 12, color, muted }: { status: Status; size?: number; color?: string; muted?: boolean }) {
  const c = color ?? (muted ? C.faint : STATUS_COLOR[status])
  const r = size / 2
  if (status === 'done') {
    return (
      <AutoLayout width={size} height={size} cornerRadius={r} fill={c} horizontalAlignItems="center" verticalAlignItems="center">
        <Text fontFamily={FONT} fontSize={Math.round(size * 0.66)} fontWeight={700} fill="#FFFFFF" lineHeight={size}>
          ✓
        </Text>
      </AutoLayout>
    )
  }
  return (
    <AutoLayout
      width={size}
      height={size}
      cornerRadius={r}
      stroke={c}
      strokeWidth={1.5}
      strokeAlign="inside"
      horizontalAlignItems="center"
      verticalAlignItems="center"
    >
      {status === 'inprogress' ? (
        <Ellipse width={size - 5} height={size - 5} fill={c} arcData={{ startingAngle: -Math.PI / 2, endingAngle: Math.PI / 2, innerRadius: 0 }} />
      ) : status === 'blocked' ? (
        <Rectangle width={Math.round(size * 0.45)} height={1.5} fill={c} />
      ) : null}
    </AutoLayout>
  )
}

/** Initials avatar; dashed "?" ring when unassigned. */
function Avatar({ name, size = 18 }: { name: string; size?: number }) {
  if (!name) {
    return (
      <AutoLayout
        width={size}
        height={size}
        cornerRadius={size / 2}
        stroke={C.borderStrong}
        strokeDashPattern={[2, 2]}
        horizontalAlignItems="center"
        verticalAlignItems="center"
      >
        <Text fontFamily={FONT} fontSize={Math.round(size * 0.5)} fontWeight={600} fill={C.faint} lineHeight={size}>
          ?
        </Text>
      </AutoLayout>
    )
  }
  const [bg, fg] = avatarColors(name)
  return (
    <AutoLayout width={size} height={size} cornerRadius={size / 2} fill={bg} horizontalAlignItems="center" verticalAlignItems="center">
      <Text fontFamily={FONT} fontSize={Math.round(size * 0.44)} fontWeight={700} fill={fg} lineHeight={size} letterSpacing={0.2}>
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
  const size = props.size ?? 11
  return (
    <Text
      fontFamily={FONT}
      fontSize={size}
      fontWeight={props.weight ?? 400}
      fill={props.color ?? C.text}
      width={props.width ?? 'hug-contents'}
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
  const pad = props.small ? { vertical: 3, horizontal: 7 } : { vertical: 6, horizontal: 10 }
  return (
    <AutoLayout
      direction="horizontal"
      spacing={5}
      padding={pad}
      cornerRadius={8}
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
  const s = props.size ?? 20
  return (
    <AutoLayout
      width={s}
      height={s}
      cornerRadius={6}
      horizontalAlignItems="center"
      verticalAlignItems="center"
      onClick={props.onClick}
      hoverStyle={{ fill: C.surfaceAlt }}
      tooltip={props.tooltip}
    >
      <Icon name={props.icon} color={props.color ?? C.muted} size={Math.round(s * 0.6)} />
    </AutoLayout>
  )
}

/** Text-only toggle chip (filters, option rows). Optional leading glyph node. */
function Chip(props: {
  label: string
  active?: boolean
  onClick: () => void | Promise<void>
  color?: string
  soft?: string
  tooltip?: string
  dashed?: boolean
  lead?: any
}) {
  const active = !!props.active
  const color = props.color ?? C.accent
  const soft = props.soft ?? C.accentSoft
  return (
    <AutoLayout
      direction="horizontal"
      spacing={4}
      padding={{ vertical: 3, horizontal: 8 }}
      cornerRadius={999}
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

function Pill({ text, color, fill, size = 9 }: { text: string; color: string; fill: string; size?: number }) {
  return (
    <AutoLayout padding={{ vertical: 1, horizontal: 6 }} cornerRadius={999} fill={fill} verticalAlignItems="center">
      <Label size={size} weight={700} color={color}>
        {text}
      </Label>
    </AutoLayout>
  )
}

function Divider() {
  return <Rectangle width="fill-parent" height={1} fill={C.border} />
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
// Widget
// ---------------------------------------------------------------------------
function Widget() {
  const tasks = useSyncedMap<Task>('tasks')
  const [view, setView] = useSyncedState<View>('view', 'board')
  const [collapsed, setCollapsed] = useSyncedState<Record<string, boolean>>('collapsed', { done: true })
  const [openId, setOpenId] = useSyncedState<string | null>('openId', null)
  const [confirmDeleteId, setConfirmDeleteId] = useSyncedState<string | null>('confirmDeleteId', null)
  const [filters, setFilters] = useSyncedState<Filters>('filters', EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useSyncedState<boolean>('filtersOpen', false)
  const [search, setSearch] = useSyncedState<string>('search', '')
  const [sort, setSort] = useSyncedState<SortMode>('sort', 'due')
  const [quickAddOpen, setQuickAddOpen] = useSyncedState<boolean>('quickAddOpen', false)
  const [draft, setDraft] = useSyncedState<Draft>('draft', { status: 'todo', priority: null, due: null, assignee: '' })
  const [celebrating, setCelebrating] = useSyncedState<string | null>('celebrating', null)
  const [showArchived, setShowArchived] = useSyncedState<boolean>('showArchived', false)
  const [doneSearch, setDoneSearch] = useSyncedState<string>('doneSearch', '')
  const [staleDays, setStaleDays] = useSyncedState<number>('staleDays', 7)
  const [boardTitle, setBoardTitle] = useSyncedState<string>('boardTitle', 'Team tasks')

  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  const nextMon = nextMondayISO()
  const all = tasks.values()
  const live = all.filter((t) => !t.archived)
  const active = live.filter((t) => t.status !== 'done')
  const done = live.filter((t) => t.status === 'done')
  const archived = all.filter((t) => t.archived)

  // ------------------------------------------------------------- mutations
  const patch = (id: string, p: Partial<Task>) => {
    const t = tasks.get(id)
    if (!t) return
    tasks.set(id, { ...t, ...p, updatedAt: Date.now() })
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
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archived: false,
      ...extra,
    }
    if (t.status === 'done') t.completedAt = now
    tasks.set(t.id, t)
    toast(`Added “${clean.length > 32 ? clean.slice(0, 32) + '…' : clean}”`)
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
    tasks.delete(id)
    setConfirmDeleteId(null)
    if (openId === id) setOpenId(null)
    toast('Task deleted')
  }

  const setDue = (id: string, due: string | null) => {
    patch(id, { due })
    toast(due ? `Due ${dueLabel(due)}` : 'Due date cleared')
  }

  /** figma.currentUser may only be read inside event handlers, never while rendering. */
  const myName = (): string | null => {
    const name = figma.currentUser?.name
    if (!name) toast('Could not read your Figma name — type a name instead')
    return name ?? null
  }

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters({ ...filters, [key]: value })
  const toggleFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilter(key, (filters[key] === value ? (key === 'stale' ? false : null) : value) as Filters[K])

  const activeFilterCount =
    (filters.assignee ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.due ? 1 : 0) + (filters.status ? 1 : 0) + (filters.stale ? 1 : 0)
  const anyFilter = activeFilterCount > 0 || search.trim().length > 0

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setSearch('')
  }

  const isStale = (t: Task) => t.status === 'todo' && ageInDays(t.createdAt) >= staleDays

  // ---------------------------------------------------------------- filtering
  const q = search.trim().toLowerCase()
  const matches = (t: Task): boolean => {
    if (q && !(t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q))) return false
    if (filters.assignee === '__none__' && t.assignee) return false
    if (filters.assignee && filters.assignee !== '__none__' && t.assignee !== filters.assignee) return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.status && t.status !== filters.status) return false
    if (filters.stale && !isStale(t)) return false
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

  const knownAssignees = Array.from(new Set(live.map((t) => t.assignee).filter((a) => a))).sort()
  const overdueCount = active.filter((t) => isOverdue(t.due)).length
  const blockedCount = active.filter((t) => t.status === 'blocked').length
  const unassignedCount = active.filter((t) => !t.assignee).length
  const staleCount = active.filter(isStale).length

  // ------------------------------------------------------------ property menu
  usePropertyMenu(
    [
      {
        itemType: 'dropdown',
        propertyName: 'view',
        tooltip: 'View',
        selectedOption: view,
        options: [
          { option: 'board', label: 'Board' },
          { option: 'week', label: 'Week' },
          { option: 'done', label: 'Done' },
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
      { itemType: 'separator' },
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
        case 'sort':
          setSort(propertyValue as SortMode)
          break
        case 'stale':
          setStaleDays(parseInt(propertyValue as string, 10))
          break
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
        tasks.set(t.id, { ...t, archived: true, updatedAt: Date.now() })
        n++
      }
    }
    toast(n ? `Archived ${n} completed task${n === 1 ? '' : 's'}` : 'Nothing older than 14 days to archive')
  }

  const addSamples = () => {
    const d = (n: number) => addDaysISO(today, n)
    const samples: Array<Partial<Task> & { title: string }> = [
      { title: 'Draft Q4 roadmap outline', status: 'todo', priority: 'high', due: d(1), assignee: 'Maya Chen' },
      { title: 'Review onboarding copy', status: 'todo', priority: 'medium', due: d(3) },
      { title: 'Collect customer interview notes', status: 'todo', priority: 'low', due: d(-2), assignee: 'Jon Park' },
      { title: 'Prototype billing settings page', status: 'inprogress', priority: 'high', due: d(0), assignee: 'Priya Nair' },
      { title: 'Update design tokens', status: 'inprogress', priority: 'medium', due: d(5), assignee: 'Maya Chen' },
      { title: 'Waiting on legal: privacy copy', status: 'blocked', priority: 'high', due: d(-1), assignee: 'Jon Park', description: 'Blocked until legal signs off on the new consent wording.' },
      { title: 'Ship notification preferences', status: 'done', priority: 'medium', due: d(-3), assignee: 'Priya Nair' },
      { title: 'Fix mobile nav overlap', status: 'done', priority: 'high', due: d(-6), assignee: 'Maya Chen' },
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
        createdAt: now - 9 * 86400000 * (i % 2),
        updatedAt: now,
        completedAt: s.status === 'done' ? now - 2 * 86400000 : null,
        archived: false,
      }
      tasks.set(t.id, t)
    })
    toast('Added 8 sample tasks')
  }

  // ------------------------------------------------------------------- card
  function Card({ task, width, showStatus }: { task: Task; width: number | 'fill-parent'; showStatus?: boolean }) {
    const open = openId === task.id
    const isCelebrating = celebrating === task.id
    const overdue = isOverdue(task.due) && task.status !== 'done'
    const stale = isStale(task)
    const isDone = task.status === 'done' || isCelebrating
    const stripe = isCelebrating ? C.success : task.status === 'blocked' ? STATUS_COLOR.blocked : overdue ? C.danger : null

    return (
      <AutoLayout
        key={task.id}
        direction="horizontal"
        width={width}
        fill={isCelebrating ? C.successSoft : C.bg}
        cornerRadius={8}
        stroke={open ? C.accent : isCelebrating ? C.success : C.border}
        strokeWidth={1}
        hoverStyle={open ? undefined : { stroke: C.borderStrong }}
        overflow="hidden"
      >
        {stripe ? <Rectangle width={3} height="fill-parent" fill={stripe} /> : null}
        <AutoLayout direction="vertical" width="fill-parent" spacing={5} padding={{ vertical: 7, horizontal: 9 }}>
          {/* Row 1: check, title, priority */}
          <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="start">
            <AutoLayout
              width={16}
              height={16}
              cornerRadius={8}
              fill={isDone ? C.success : undefined}
              stroke={isDone ? undefined : C.borderStrong}
              strokeWidth={1.5}
              strokeAlign="inside"
              horizontalAlignItems="center"
              verticalAlignItems="center"
              onClick={() => complete(task.id)}
              hoverStyle={{ fill: isDone ? C.success : C.successSoft, stroke: C.success }}
              tooltip={isDone ? 'Completed' : 'Mark done'}
            >
              {isDone ? (
                <Text fontFamily={FONT} fontSize={10} fontWeight={700} fill="#FFFFFF" lineHeight={16}>
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
                fontSize={12}
                fontWeight={600}
                fill={C.text}
                width="fill-parent"
                inputBehavior="wrap"
                inputFrameProps={{ padding: 0 }}
              />
            ) : (
              <AutoLayout width="fill-parent" onClick={() => setOpenId(task.id)} tooltip="Open details">
                <Label size={12} weight={600} width="fill-parent" truncate={2} strike={isDone} color={isDone ? C.muted : C.text}>
                  {task.title || 'Untitled'}
                </Label>
              </AutoLayout>
            )}
            {task.priority ? (
              <AutoLayout
                padding={{ vertical: 1, horizontal: 6 }}
                cornerRadius={999}
                fill={PRIORITY_SOFT[task.priority]}
                tooltip={`${PRIORITY_LABEL[task.priority]} priority`}
                onClick={() => setOpenId(open ? null : task.id)}
              >
                <Label size={9} weight={700} color={PRIORITY_COLOR[task.priority]}>
                  {PRIORITY_GLYPH[task.priority]}
                </Label>
              </AutoLayout>
            ) : null}
          </AutoLayout>

          {/* Row 2: avatar, due, stale, (status pill), selector */}
          <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center" wrap>
            <AutoLayout
              direction="horizontal"
              spacing={4}
              verticalAlignItems="center"
              onClick={() => setOpenId(task.id)}
              tooltip={task.assignee ? `Assigned to ${task.assignee}` : 'Unassigned — click to assign'}
            >
              <Avatar name={task.assignee} />
              {task.assignee ? null : (
                <Label size={10} weight={500} color={C.faint} italic>
                  Unassigned
                </Label>
              )}
            </AutoLayout>

            {task.due ? (
              <AutoLayout
                padding={{ vertical: 1, horizontal: 6 }}
                cornerRadius={999}
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
              <AutoLayout
                padding={{ vertical: 1, horizontal: 6 }}
                cornerRadius={999}
                onClick={() => setDue(task.id, today)}
                hoverStyle={{ fill: C.surface }}
                tooltip="No due date — click to set Today"
              >
                <Label size={10} weight={500} color={C.faint}>
                  + date
                </Label>
              </AutoLayout>
            )}

            {stale && !isDone ? (
              <AutoLayout padding={{ vertical: 1, horizontal: 6 }} cornerRadius={999} fill={C.warnSoft} tooltip={`In To Do for ${ageInDays(task.createdAt)} days`}>
                <Label size={10} weight={700} color={C.warn}>
                  {`${ageInDays(task.createdAt)}d old`}
                </Label>
              </AutoLayout>
            ) : null}

            {showStatus ? (
              <AutoLayout direction="horizontal" spacing={4} padding={{ vertical: 1, horizontal: 6 }} cornerRadius={999} fill={STATUS_SOFT[task.status]} verticalAlignItems="center">
                <StatusGlyph status={task.status} size={10} />
                <Label size={10} weight={700} color={STATUS_COLOR[task.status]}>
                  {STATUS_LABEL[task.status]}
                </Label>
              </AutoLayout>
            ) : null}

            {/* one-step status selector */}
            <AutoLayout direction="horizontal" spacing={1} cornerRadius={6} fill={C.surface} padding={1}>
              {STATUSES.map((s) => {
                const current = task.status === s && !isCelebrating
                return (
                  <AutoLayout
                    key={s}
                    width={22}
                    height={18}
                    cornerRadius={5}
                    fill={current ? C.bg : undefined}
                    stroke={current ? C.border : undefined}
                    horizontalAlignItems="center"
                    verticalAlignItems="center"
                    onClick={() => setStatus(task.id, s)}
                    hoverStyle={{ fill: current ? C.bg : STATUS_SOFT[s] }}
                    tooltip={current ? `${STATUS_LABEL[s]} (current)` : `Move to ${STATUS_LABEL[s]}`}
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

          {open ? <CardDetails task={task} /> : null}
        </AutoLayout>
      </AutoLayout>
    )
  }

  function CardDetails({ task }: { task: Task }) {
    const confirming = confirmDeleteId === task.id
    const customDue = !!task.due && task.due !== today && task.due !== tomorrow && task.due !== nextMon
    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={7} padding={{ top: 2 }}>
        <Divider />
        <Input
          value={task.description || null}
          placeholder="Add a description…"
          onTextEditEnd={(e) => {
            if (e.characters !== task.description) patch(task.id, { description: e.characters })
          }}
          fontFamily={FONT}
          fontSize={11}
          fill={C.text}
          placeholderProps={{ fill: C.faint }}
          width="fill-parent"
          inputBehavior="multiline"
          inputFrameProps={{ padding: { vertical: 5, horizontal: 7 }, fill: C.surface, cornerRadius: 6 }}
        />

        <Row label="Status">
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={STATUS_LABEL[s]}
              lead={<StatusGlyph status={s} size={10} muted={task.status !== s} />}
              active={task.status === s}
              color={STATUS_COLOR[s]}
              soft={STATUS_SOFT[s]}
              onClick={() => setStatus(task.id, s)}
            />
          ))}
        </Row>

        <Row label="Due">
          <Chip label="Today" active={task.due === today} onClick={() => setDue(task.id, today)} />
          <Chip label="Tomorrow" active={task.due === tomorrow} onClick={() => setDue(task.id, tomorrow)} />
          <Chip label="Next Mon" active={task.due === nextMon} onClick={() => setDue(task.id, nextMon)} />
          <Chip
            label={customDue ? weekdayDate(task.due as string) : 'Pick date…'}
            active={customDue}
            onClick={() => pickDate(task.title, task.due, (iso) => setDue(task.id, iso))}
          />
          {task.due ? <IconBtn icon="x" size={18} tooltip="Clear due date" onClick={() => setDue(task.id, null)} /> : null}
        </Row>

        <Row label="Owner">
          <Input
            value={task.assignee || null}
            placeholder="Unassigned"
            onTextEditEnd={(e) => {
              const v = e.characters.trim()
              if (v !== task.assignee) patch(task.id, { assignee: v })
            }}
            fontFamily={FONT}
            fontSize={10}
            fontWeight={600}
            fill={C.text}
            placeholderProps={{ fill: C.faint, italic: true }}
            width={96}
            inputBehavior="truncate"
            inputFrameProps={{ padding: { vertical: 3, horizontal: 8 }, fill: C.bg, stroke: C.border, cornerRadius: 999 }}
          />
          <Chip
            label="Me"
            tooltip="Assign to me"
            onClick={() => {
              const name = myName()
              if (name) patch(task.id, { assignee: task.assignee === name ? '' : name })
            }}
          />
          {knownAssignees.slice(0, 3).map((a) => (
            <Chip key={a} label={shortName(a)} active={task.assignee === a} onClick={() => patch(task.id, { assignee: task.assignee === a ? '' : a })} />
          ))}
        </Row>

        <Row label="Priority">
          {PRIORITIES.map((p) => (
            <Chip
              key={p}
              label={PRIORITY_GLYPH[p]}
              active={task.priority === p}
              color={PRIORITY_COLOR[p]}
              soft={PRIORITY_SOFT[p]}
              onClick={() => patch(task.id, { priority: task.priority === p ? null : p })}
            />
          ))}
        </Row>

        <AutoLayout direction="horizontal" width="fill-parent" verticalAlignItems="center" spacing={4}>
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

  function Row({ label, children }: { label: string; children?: any }) {
    return (
      <AutoLayout direction="horizontal" width="fill-parent" spacing={4} verticalAlignItems="center" wrap>
        <AutoLayout width={46}>
          <Label size={9} weight={700} color={C.faint}>
            {label.toUpperCase()}
          </Label>
        </AutoLayout>
        {children}
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- column
  function Column({ status }: { status: Status }) {
    const isCollapsed = !!collapsed[status]
    const items = live.filter((t) => t.status === status)
    const visible = items.filter(matches).sort(compare)
    const color = STATUS_COLOR[status]
    const hiddenByFilter = items.length - visible.length

    if (isCollapsed) {
      return (
        <AutoLayout
          key={status}
          direction="vertical"
          width={COLLAPSED_W}
          spacing={8}
          padding={{ vertical: 10, horizontal: 4 }}
          fill={STATUS_TINT[status]}
          cornerRadius={12}
          horizontalAlignItems="center"
          onClick={() => setCollapsed({ ...collapsed, [status]: false })}
          hoverStyle={{ fill: STATUS_SOFT[status] }}
          tooltip={`Expand ${STATUS_LABEL[status]} (${items.length})`}
        >
          <Rectangle width={20} height={3} cornerRadius={2} fill={color} />
          <StatusGlyph status={status} size={14} />
          <Pill text={String(items.length)} color={color} fill={C.bg} size={10} />
          <AutoLayout direction="vertical" spacing={-1} horizontalAlignItems="center" padding={{ top: 2 }}>
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
      <AutoLayout key={status} direction="vertical" width={COL_W} spacing={8} padding={{ top: 0, bottom: 10, left: 10, right: 10 }} fill={STATUS_TINT[status]} cornerRadius={12} overflow="hidden">
        {/* coloured top bar: the column's identity */}
        <Rectangle width="fill-parent" height={4} fill={color} />
        <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
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
          <AutoLayout width="fill-parent" height={1} />
          <IconBtn icon="chevronDown" tooltip="Collapse column" onClick={() => setCollapsed({ ...collapsed, [status]: true })} />
        </AutoLayout>

        {status === 'done' ? (
          <AutoLayout direction="vertical" width="fill-parent" spacing={4}>
            {visible.slice(0, 4).map((t) => (
              <DoneRow key={t.id} task={t} compact />
            ))}
            {visible.length === 0 ? (
              <Label size={10} color={C.faint} italic>
                Completed tasks land here.
              </Label>
            ) : null}
            <Btn
              label={visible.length > 4 ? `View all ${visible.length} completed` : 'Open Done view'}
              icon="chevronRight"
              tone="ghost"
              small
              onClick={() => setView('done')}
            />
          </AutoLayout>
        ) : (
          <AutoLayout direction="vertical" width="fill-parent" spacing={6}>
            {visible.map((t) => (
              <Card key={t.id} task={t} width="fill-parent" />
            ))}
            {visible.length === 0 ? (
              <AutoLayout width="fill-parent" padding={{ vertical: 4, horizontal: 4 }}>
                <Label size={10} color={C.faint} italic>
                  {items.length > 0 ? 'No matches for current filters.' : status === 'todo' && live.length === 0 ? 'Type below to add your first task.' : 'Nothing here.'}
                </Label>
              </AutoLayout>
            ) : null}
            {/* inline quick add — ghost style until hovered */}
            <Input
              value={null}
              placeholder="+ New task"
              onTextEditEnd={(e) => createTask(e.characters, { status })}
              fontFamily={FONT}
              fontSize={11}
              fontWeight={500}
              fill={C.text}
              placeholderProps={{ fill: C.muted, fontWeight: 600 }}
              width="fill-parent"
              inputBehavior="wrap"
              inputFrameProps={{
                padding: { vertical: 6, horizontal: 8 },
                cornerRadius: 8,
                hoverStyle: { fill: C.bg },
              }}
            />
          </AutoLayout>
        )}
      </AutoLayout>
    )
  }

  // ------------------------------------------------------------- done rows
  function DoneRow({ task, compact }: { task: Task; compact?: boolean }) {
    return (
      <AutoLayout
        key={task.id}
        direction="horizontal"
        width="fill-parent"
        spacing={8}
        padding={{ vertical: 5, horizontal: 8 }}
        fill={C.bg}
        cornerRadius={8}
        stroke={C.border}
        verticalAlignItems="center"
        hoverStyle={{ stroke: C.borderStrong }}
      >
        {task.archived ? <Icon name="archive" color={C.faint} size={13} /> : <StatusGlyph status="done" size={14} />}
        <AutoLayout direction="vertical" width="fill-parent" spacing={1}>
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
          <Avatar name={task.assignee} size={16} />
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
      <AutoLayout direction="vertical" spacing={8} width={BOARD_W}>
        {groups.map((g) => (
          <AutoLayout key={g.key} direction="horizontal" width="fill-parent" spacing={10} padding={10} fill={g.tint} cornerRadius={12} verticalAlignItems="start">
            {/* day label rail */}
            <AutoLayout direction="vertical" width={118} spacing={2}>
              <AutoLayout direction="horizontal" spacing={6} verticalAlignItems="center">
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
              <AutoLayout direction="horizontal" width="fill-parent" spacing={8} wrap verticalAlignItems="start">
                {g.items.map((t) => (
                  <Card key={t.id} task={t} width={CARD_W} showStatus />
                ))}
              </AutoLayout>
            ) : (
              <AutoLayout width="fill-parent" padding={{ vertical: 2 }}>
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
      .filter((t) => !dq || t.title.toLowerCase().includes(dq) || t.description.toLowerCase().includes(dq) || t.assignee.toLowerCase().includes(dq))
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))

    return (
      <AutoLayout direction="vertical" spacing={8} width={BOARD_W}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={8} verticalAlignItems="center">
          <AutoLayout direction="horizontal" spacing={6} verticalAlignItems="center" padding={{ vertical: 5, horizontal: 9 }} fill={C.bg} stroke={C.border} cornerRadius={8} width={260}>
            <Icon name="search" color={C.faint} size={12} />
            <Input
              value={doneSearch || null}
              placeholder="Search completed tasks…"
              onTextEditEnd={(e) => setDoneSearch(e.characters)}
              fontFamily={FONT}
              fontSize={11}
              fill={C.text}
              placeholderProps={{ fill: C.faint }}
              width="fill-parent"
              inputBehavior="truncate"
              inputFrameProps={{ padding: 0 }}
            />
            {doneSearch ? <IconBtn icon="x" size={16} tooltip="Clear search" onClick={() => setDoneSearch('')} /> : null}
          </AutoLayout>
          <Chip label={`Show archived (${archived.length})`} active={showArchived} onClick={() => setShowArchived(!showArchived)} />
          <AutoLayout width="fill-parent" height={1} />
          <Btn small label="Archive done > 14 days" icon="archive" onClick={archiveOld} tooltip="Move completed tasks older than 14 days to the archive" />
        </AutoLayout>

        <AutoLayout direction="vertical" width="fill-parent" spacing={6} padding={{ top: 0, bottom: 10, left: 10, right: 10 }} fill={STATUS_TINT.done} cornerRadius={12} overflow="hidden">
          <Rectangle width="fill-parent" height={4} fill={STATUS_COLOR.done} />
          <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
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
    )
  }

  // ---------------------------------------------------------------- panels
  function QuickAddPanel() {
    const customDue = !!draft.due && draft.due !== today && draft.due !== tomorrow && draft.due !== nextMon
    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={8} padding={10} fill={C.accentSoft} cornerRadius={12}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
          <Input
            value={null}
            placeholder="New task title — press Enter to add, then type the next one"
            onTextEditEnd={(e) => createTask(e.characters, { status: draft.status, priority: draft.priority, due: draft.due, assignee: draft.assignee })}
            fontFamily={FONT}
            fontSize={12}
            fontWeight={500}
            fill={C.text}
            placeholderProps={{ fill: C.faint, fontWeight: 400 }}
            width="fill-parent"
            inputBehavior="wrap"
            inputFrameProps={{ padding: { vertical: 7, horizontal: 10 }, fill: C.bg, stroke: C.accent, cornerRadius: 8 }}
          />
          <IconBtn icon="x" tooltip="Close quick add" onClick={() => setQuickAddOpen(false)} />
        </AutoLayout>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={12} wrap verticalAlignItems="center">
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            {ACTIVE_STATUSES.map((s) => (
              <Chip
                key={s}
                label={STATUS_LABEL[s]}
                lead={<StatusGlyph status={s} size={10} muted={draft.status !== s} />}
                active={draft.status === s}
                color={STATUS_COLOR[s]}
                soft={STATUS_SOFT[s]}
                onClick={() => setDraft({ ...draft, status: s })}
              />
            ))}
          </AutoLayout>
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            <Chip label="Today" active={draft.due === today} onClick={() => setDraft({ ...draft, due: draft.due === today ? null : today })} />
            <Chip label="Tomorrow" active={draft.due === tomorrow} onClick={() => setDraft({ ...draft, due: draft.due === tomorrow ? null : tomorrow })} />
            <Chip label="Next Mon" active={draft.due === nextMon} onClick={() => setDraft({ ...draft, due: draft.due === nextMon ? null : nextMon })} />
            <Chip
              label={customDue ? weekdayDate(draft.due as string) : 'Pick…'}
              active={customDue}
              onClick={() => pickDate('New task', draft.due, (iso) => setDraft({ ...draft, due: iso }))}
            />
          </AutoLayout>
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                label={PRIORITY_GLYPH[p]}
                active={draft.priority === p}
                color={PRIORITY_COLOR[p]}
                soft={PRIORITY_SOFT[p]}
                onClick={() => setDraft({ ...draft, priority: draft.priority === p ? null : p })}
              />
            ))}
          </AutoLayout>
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            <Input
              value={draft.assignee || null}
              placeholder="Assignee"
              onTextEditEnd={(e) => setDraft({ ...draft, assignee: e.characters.trim() })}
              fontFamily={FONT}
              fontSize={10}
              fontWeight={600}
              fill={C.text}
              placeholderProps={{ fill: C.faint, italic: true }}
              width={88}
              inputBehavior="truncate"
              inputFrameProps={{ padding: { vertical: 3, horizontal: 8 }, fill: C.bg, stroke: C.border, cornerRadius: 999 }}
            />
            <Chip
              label="Me"
              tooltip="Assign to me"
              onClick={() => {
                const name = myName()
                if (name) setDraft({ ...draft, assignee: draft.assignee === name ? '' : name })
              }}
            />
          </AutoLayout>
        </AutoLayout>
      </AutoLayout>
    )
  }

  function FilterPanel() {
    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={8} padding={10} fill={C.bg} cornerRadius={12} stroke={C.border}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={12} wrap verticalAlignItems="center">
          <FilterGroup label="Quick">
            <Chip label={`Overdue (${overdueCount})`} color={C.danger} soft={C.dangerSoft} active={filters.due === 'overdue'} onClick={() => toggleFilter('due', 'overdue')} />
            <Chip label={`Unassigned (${unassignedCount})`} active={filters.assignee === '__none__'} onClick={() => toggleFilter('assignee', '__none__')} dashed />
            <Chip label={`Stale in To Do ${staleDays}d+ (${staleCount})`} color={C.warn} soft={C.warnSoft} active={filters.stale} onClick={() => setFilter('stale', !filters.stale)} />
          </FilterGroup>
          <FilterGroup label="Due">
            <Chip label="Today" active={filters.due === 'today'} onClick={() => toggleFilter('due', 'today')} />
            <Chip label="This week" active={filters.due === 'week'} onClick={() => toggleFilter('due', 'week')} />
            <Chip label="No date" active={filters.due === 'none'} onClick={() => toggleFilter('due', 'none')} />
          </FilterGroup>
          <FilterGroup label="Priority">
            {PRIORITIES.map((p) => (
              <Chip key={p} label={PRIORITY_GLYPH[p]} color={PRIORITY_COLOR[p]} soft={PRIORITY_SOFT[p]} active={filters.priority === p} onClick={() => toggleFilter('priority', p)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Status">
            {STATUSES.map((s) => (
              <Chip
                key={s}
                label={STATUS_LABEL[s]}
                lead={<StatusGlyph status={s} size={10} muted={filters.status !== s} />}
                color={STATUS_COLOR[s]}
                soft={STATUS_SOFT[s]}
                active={filters.status === s}
                onClick={() => toggleFilter('status', s)}
              />
            ))}
          </FilterGroup>
          {knownAssignees.length ? (
            <FilterGroup label="Assignee">
              {knownAssignees.map((a) => (
                <Chip key={a} label={shortName(a)} lead={<Avatar name={a} size={14} />} active={filters.assignee === a} onClick={() => toggleFilter('assignee', a)} />
              ))}
            </FilterGroup>
          ) : null}
        </AutoLayout>
        {anyFilter ? (
          <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
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
      <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
        <Label size={9} weight={700} color={C.faint}>
          {label.toUpperCase()}
        </Label>
        {children}
      </AutoLayout>
    )
  }

  function ViewTab({ id, label, iconName, count }: { id: View; label: string; iconName: IconName; count?: number }) {
    const on = view === id
    return (
      <AutoLayout
        direction="horizontal"
        spacing={5}
        padding={{ vertical: 5, horizontal: 10 }}
        cornerRadius={7}
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
        {count !== undefined && count > 0 ? <Pill text={String(count)} color={on ? C.success : C.muted} fill={on ? C.successSoft : C.surfaceAlt} /> : null}
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- header
  return (
    <AutoLayout
      direction="vertical"
      spacing={10}
      padding={12}
      fill={C.bg}
      cornerRadius={16}
      stroke={C.border}
      strokeWidth={1}
      width="hug-contents"
      effect={{ type: 'drop-shadow', color: { r: 0.07, g: 0.09, b: 0.15, a: 0.08 }, offset: { x: 0, y: 4 }, blur: 16 }}
    >
      <AutoLayout direction="horizontal" width={BOARD_W} spacing={10} verticalAlignItems="center">
        <AutoLayout direction="vertical" spacing={2}>
          <Input
            value={boardTitle}
            placeholder="Board title"
            onTextEditEnd={(e) => setBoardTitle(e.characters.trim() || 'Team tasks')}
            fontFamily={FONT}
            fontSize={15}
            fontWeight={700}
            fill={C.text}
            width={190}
            inputBehavior="truncate"
            inputFrameProps={{ padding: 0 }}
          />
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            <Pill text={`${active.length} active`} color={C.muted} fill={C.surface} />
            {overdueCount ? <Pill text={`${overdueCount} overdue`} color={C.danger} fill={C.dangerSoft} /> : null}
            {blockedCount ? <Pill text={`${blockedCount} blocked`} color={STATUS_COLOR.blocked} fill={STATUS_SOFT.blocked} /> : null}
            <Pill text={`${done.length} done`} color={C.success} fill={C.successSoft} />
          </AutoLayout>
        </AutoLayout>

        <AutoLayout direction="horizontal" spacing={2} padding={3} fill={C.surface} cornerRadius={9}>
          <ViewTab id="board" label="Board" iconName="board" />
          <ViewTab id="week" label="Week" iconName="week" />
          <ViewTab id="done" label="Done" iconName="check" count={done.length} />
        </AutoLayout>

        <AutoLayout width="fill-parent" height={1} />

        <AutoLayout direction="horizontal" spacing={6} verticalAlignItems="center" padding={{ vertical: 5, horizontal: 9 }} fill={C.surface} stroke={search ? C.accent : undefined} cornerRadius={8} width={200}>
          <Icon name="search" color={search ? C.accent : C.faint} size={12} />
          <Input
            value={search || null}
            placeholder="Search tasks…"
            onTextEditEnd={(e) => setSearch(e.characters)}
            fontFamily={FONT}
            fontSize={11}
            fill={C.text}
            placeholderProps={{ fill: C.faint }}
            width="fill-parent"
            inputBehavior="truncate"
            inputFrameProps={{ padding: 0 }}
          />
          {search ? <IconBtn icon="x" size={16} tooltip="Clear search" onClick={() => setSearch('')} /> : null}
        </AutoLayout>

        <Btn
          label={activeFilterCount ? `Filters · ${activeFilterCount}` : 'Filters'}
          icon="filter"
          tone={filtersOpen || activeFilterCount ? 'primary' : 'default'}
          onClick={() => setFiltersOpen(!filtersOpen)}
          tooltip="Filter by assignee, priority, due date, status"
        />
        <Btn label="Add task" icon="plus" tone={quickAddOpen ? 'default' : 'primary'} onClick={() => setQuickAddOpen(!quickAddOpen)} tooltip="Quick add with optional details (or type directly into a column)" />
      </AutoLayout>

      {quickAddOpen ? <QuickAddPanel /> : null}
      {filtersOpen ? <FilterPanel /> : null}

      {live.length === 0 ? (
        <AutoLayout direction="horizontal" width={BOARD_W} spacing={8} padding={{ vertical: 8, horizontal: 10 }} fill={C.surface} cornerRadius={10} verticalAlignItems="center">
          <Label size={11} color={C.muted} width="fill-parent">
            Empty board. Type a title into any column, use “Add task”, or load a few sample tasks to see how it works.
          </Label>
          <Btn small label="Load sample tasks" onClick={addSamples} />
        </AutoLayout>
      ) : null}

      {view === 'board' ? <BoardView /> : view === 'week' ? <WeekView /> : <DoneView />}
    </AutoLayout>
  )
}

widget.register(Widget)
