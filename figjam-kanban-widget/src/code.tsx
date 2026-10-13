import {
  ACTIVE_STATUSES,
  Draft,
  EMPTY_FILTERS,
  Filters,
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  Priority,
  SortMode,
  STATUSES,
  STATUS_LABEL,
  STATUS_SHORT,
  Status,
  Task,
  View,
} from './types'
import {
  addDaysISO,
  ageInDays,
  daysFromToday,
  dueLabel,
  fromTimestamp,
  isOverdue,
  nextMondayISO,
  todayISO,
  weekdayDate,
} from './dates'
import { C, PRIORITY_COLOR, PRIORITY_SOFT, STATUS_COLOR, STATUS_ICON, STATUS_SOFT, icon, IconName } from './theme'

const { widget } = figma
const { AutoLayout, Text, Input, SVG, useSyncedState, useSyncedMap, usePropertyMenu } = widget

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const COL_W = 248
const COL_GAP = 8
const BOARD_W = COL_W * 4 + COL_GAP * 3 // 1016
const COLLAPSED_W = 36
const CARD_W = COL_W - 16
const FONT = 'Inter'

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const toast = (msg: string) => figma.notify(msg, { timeout: 1400 })
const shortName = (s: string) => (s.length > 14 ? s.slice(0, 13) + '…' : s)

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function Icon({ name, color, size = 12 }: { name: IconName; color: string; size?: number }) {
  return <SVG src={icon(name, color, size)} width={size} height={size} />
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
  return (
    <Text
      fontFamily={FONT}
      fontSize={props.size ?? 11}
      fontWeight={props.weight ?? 400}
      fill={props.color ?? C.text}
      width={props.width ?? 'hug-contents'}
      truncate={props.truncate}
      textDecoration={props.strike ? 'strikethrough' : 'none'}
      italic={props.italic}
      horizontalAlignText={props.align ?? 'left'}
      lineHeight={Math.round((props.size ?? 11) * 1.35)}
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
  const fill = tone === 'primary' ? C.accent : tone === 'ghost' ? '#FFFFFF00' : tone === 'danger' ? C.dangerSoft : C.bg
  const color = tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? C.danger : tone === 'ghost' ? C.muted : C.text
  const hover = tone === 'primary' ? '#3350C4' : tone === 'danger' ? '#FADADA' : C.surfaceAlt
  const pad = props.small ? { vertical: 3, horizontal: 6 } : { vertical: 5, horizontal: 9 }
  return (
    <AutoLayout
      direction="horizontal"
      spacing={5}
      padding={pad}
      cornerRadius={6}
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
        <Label size={props.small ? 10 : 11} weight={500} color={color}>
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
      cornerRadius={5}
      horizontalAlignItems="center"
      verticalAlignItems="center"
      onClick={props.onClick}
      hoverStyle={{ fill: C.surfaceAlt }}
      tooltip={props.tooltip}
    >
      <Icon name={props.icon} color={props.color ?? C.muted} size={Math.round(s * 0.62)} />
    </AutoLayout>
  )
}

/** Toggle chip used for filters and option rows. */
function Chip(props: {
  label: string
  active?: boolean
  onClick: () => void | Promise<void>
  icon?: IconName
  color?: string
  soft?: string
  tooltip?: string
  dashed?: boolean
}) {
  const active = !!props.active
  const color = props.color ?? C.accent
  const soft = props.soft ?? C.accentSoft
  return (
    <AutoLayout
      direction="horizontal"
      spacing={4}
      padding={{ vertical: 3, horizontal: 7 }}
      cornerRadius={10}
      fill={active ? soft : C.bg}
      stroke={active ? color : C.border}
      strokeWidth={1}
      strokeDashPattern={props.dashed && !active ? [3, 2] : undefined}
      verticalAlignItems="center"
      onClick={props.onClick}
      hoverStyle={{ fill: active ? soft : C.surface, stroke: color }}
      tooltip={props.tooltip}
    >
      {props.icon ? <Icon name={props.icon} color={active ? color : C.muted} size={10} /> : null}
      <Label size={10} weight={active ? 600 : 500} color={active ? color : C.muted}>
        {props.label}
      </Label>
    </AutoLayout>
  )
}

function CountBadge({ n, color }: { n: number; color?: string }) {
  return (
    <AutoLayout padding={{ vertical: 1, horizontal: 6 }} cornerRadius={8} fill={C.surfaceAlt} verticalAlignItems="center">
      <Label size={10} weight={600} color={color ?? C.muted}>
        {String(n)}
      </Label>
    </AutoLayout>
  )
}

function Divider({ width }: { width?: number | 'fill-parent' }) {
  return <AutoLayout width={width ?? 'fill-parent'} height={1} fill={C.border} />
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

  /** Completing a task plays a brief check animation before the card moves. */
  const complete = (id: string) => {
    const t = tasks.get(id)
    if (!t || t.status === 'done') return
    setCelebrating(id)
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        patch(id, { status: 'done', completedAt: Date.now() })
        setCelebrating(null)
        if (openId === id) setOpenId(null)
        toast('✓ Completed — find it in the Done view')
        resolve()
      }, 650)
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
  const matches = (t: Task): boolean => {
    const q = search.trim().toLowerCase()
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
    // due date: earliest first, undated last
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
    if (a.due && !b.due) return -1
    if (!a.due && b.due) return 1
    const pr = PRIORITY_RANK[a.priority ?? 'none'] - PRIORITY_RANK[b.priority ?? 'none']
    if (pr !== 0) return pr
    return a.createdAt - b.createdAt
  }

  const knownAssignees = Array.from(new Set(live.map((t) => t.assignee).filter((a) => a))).sort()
  const overdueCount = active.filter((t) => isOverdue(t.due)).length
  const unassignedCount = active.filter((t) => !t.assignee).length
  const staleCount = active.filter(isStale).length
  /**
   * figma.currentUser may only be read inside event handlers (never during
   * rendering), so the "Me" shortcut resolves the name on click.
   */
  const myName = (): string | null => {
    const name = figma.currentUser?.name
    if (!name) toast('Could not read your Figma name — type a name instead')
    return name ?? null
  }

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
      { title: 'Draft Q4 roadmap outline', status: 'todo', priority: 'high', due: d(1), assignee: 'Maya' },
      { title: 'Review onboarding copy', status: 'todo', priority: 'medium', due: d(3) },
      { title: 'Collect customer interview notes', status: 'todo', priority: 'low', due: d(-2), assignee: 'Jon' },
      { title: 'Prototype billing settings page', status: 'inprogress', priority: 'high', due: d(0), assignee: 'Priya' },
      { title: 'Update design tokens', status: 'inprogress', priority: 'medium', due: d(5), assignee: 'Maya' },
      { title: 'Waiting on legal: privacy copy', status: 'blocked', priority: 'high', due: d(-1), assignee: 'Jon', description: 'Blocked until legal signs off on the new consent wording.' },
      { title: 'Ship notification preferences', status: 'done', priority: 'medium', due: d(-3), assignee: 'Priya' },
      { title: 'Fix mobile nav overlap', status: 'done', priority: 'high', due: d(-6), assignee: 'Maya' },
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
    const accent = isCelebrating ? C.success : task.status === 'blocked' ? STATUS_COLOR.blocked : overdue ? C.danger : null

    return (
      <AutoLayout
        key={task.id}
        direction="horizontal"
        width={width}
        fill={isCelebrating ? C.successSoft : C.bg}
        cornerRadius={6}
        stroke={open ? C.accent : isCelebrating ? C.success : C.border}
        strokeWidth={1}
        hoverStyle={open ? undefined : { stroke: C.borderStrong }}
        overflow="hidden"
      >
        {/* status / overdue stripe (paired with text labels, never color alone) */}
        {accent ? <AutoLayout width={3} height="fill-parent" fill={accent} /> : null}
        <AutoLayout direction="vertical" width="fill-parent" spacing={4} padding={{ vertical: 6, horizontal: 8 }}>
          {/* Row 1: check, title, priority */}
          <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="start">
            <AutoLayout
              width={18}
              height={18}
              cornerRadius={9}
              horizontalAlignItems="center"
              verticalAlignItems="center"
              onClick={() => complete(task.id)}
              hoverStyle={{ fill: C.successSoft }}
              tooltip={isDone ? 'Completed' : 'Mark done'}
            >
              <Icon name={isDone ? 'checkFilled' : 'circle'} color={isDone ? C.success : C.faint} size={16} />
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
                padding={{ vertical: 1, horizontal: 5 }}
                cornerRadius={4}
                fill={PRIORITY_SOFT[task.priority]}
                verticalAlignItems="center"
                spacing={2}
                tooltip={`${PRIORITY_LABEL[task.priority]} priority`}
                onClick={() => setOpenId(open ? null : task.id)}
              >
                <Icon name={task.priority === 'high' ? 'flagFilled' : 'flag'} color={PRIORITY_COLOR[task.priority]} size={9} />
                <Label size={9} weight={700} color={PRIORITY_COLOR[task.priority]}>
                  {task.priority === 'high' ? 'HIGH' : task.priority === 'medium' ? 'MED' : 'LOW'}
                </Label>
              </AutoLayout>
            ) : null}
          </AutoLayout>

          {/* Row 2: meta chips + status selector */}
          <AutoLayout direction="horizontal" width="fill-parent" spacing={4} verticalAlignItems="center" wrap>
            {/* assignee */}
            <AutoLayout
              direction="horizontal"
              spacing={3}
              padding={{ vertical: 1, horizontal: 5 }}
              cornerRadius={4}
              fill={task.assignee ? C.surface : undefined}
              stroke={task.assignee ? undefined : C.border}
              strokeDashPattern={task.assignee ? undefined : [3, 2]}
              verticalAlignItems="center"
              onClick={() => setOpenId(task.id)}
              hoverStyle={{ fill: C.surfaceAlt }}
              tooltip={task.assignee ? `Assigned to ${task.assignee}` : 'Unassigned — click to assign'}
            >
              <Icon name="user" color={task.assignee ? C.muted : C.faint} size={10} />
              <Label size={10} weight={500} color={task.assignee ? C.text : C.faint} italic={!task.assignee}>
                {task.assignee ? shortName(task.assignee) : 'Unassigned'}
              </Label>
            </AutoLayout>

            {/* due date */}
            {task.due ? (
              <AutoLayout
                direction="horizontal"
                spacing={3}
                padding={{ vertical: 1, horizontal: 5 }}
                cornerRadius={4}
                fill={overdue ? C.dangerSoft : C.surface}
                verticalAlignItems="center"
                onClick={() => setOpenId(task.id)}
                hoverStyle={{ fill: overdue ? '#FADADA' : C.surfaceAlt }}
                tooltip={overdue ? `Overdue — was due ${weekdayDate(task.due)}` : `Due ${weekdayDate(task.due)}`}
              >
                <Icon name={overdue ? 'alert' : 'calendar'} color={overdue ? C.danger : C.muted} size={10} />
                <Label size={10} weight={overdue ? 700 : 500} color={overdue ? C.danger : C.text}>
                  {overdue ? `Overdue · ${dueLabel(task.due)}` : dueLabel(task.due)}
                </Label>
              </AutoLayout>
            ) : (
              <AutoLayout
                width={18}
                height={18}
                cornerRadius={4}
                horizontalAlignItems="center"
                verticalAlignItems="center"
                onClick={() => setDue(task.id, today)}
                hoverStyle={{ fill: C.surfaceAlt }}
                tooltip="No due date — click to set Today"
              >
                <Icon name="calendar" color={C.faint} size={11} />
              </AutoLayout>
            )}

            {stale && !isDone ? (
              <AutoLayout
                direction="horizontal"
                spacing={3}
                padding={{ vertical: 1, horizontal: 5 }}
                cornerRadius={4}
                fill={C.warnSoft}
                verticalAlignItems="center"
                tooltip={`In To Do for ${ageInDays(task.createdAt)} days`}
              >
                <Icon name="clock" color={C.warn} size={10} />
                <Label size={10} weight={600} color={C.warn}>
                  {`${ageInDays(task.createdAt)}d`}
                </Label>
              </AutoLayout>
            ) : null}

            {showStatus ? (
              <AutoLayout
                direction="horizontal"
                spacing={3}
                padding={{ vertical: 1, horizontal: 5 }}
                cornerRadius={4}
                fill={STATUS_SOFT[task.status]}
                verticalAlignItems="center"
              >
                <Icon name={STATUS_ICON[task.status]} color={STATUS_COLOR[task.status]} size={10} />
                <Label size={10} weight={600} color={STATUS_COLOR[task.status]}>
                  {STATUS_LABEL[task.status]}
                </Label>
              </AutoLayout>
            ) : null}

            {/* one-step status selector */}
            <AutoLayout direction="horizontal" spacing={0} cornerRadius={5} fill={C.surface} padding={1}>
              {STATUSES.map((s) => {
                const current = task.status === s && !isCelebrating
                return (
                  <AutoLayout
                    key={s}
                    width={20}
                    height={18}
                    cornerRadius={4}
                    fill={current ? C.bg : undefined}
                    stroke={current ? C.border : undefined}
                    horizontalAlignItems="center"
                    verticalAlignItems="center"
                    onClick={() => setStatus(task.id, s)}
                    hoverStyle={{ fill: current ? C.bg : STATUS_SOFT[s] }}
                    tooltip={current ? `${STATUS_LABEL[s]} (current)` : `Move to ${STATUS_LABEL[s]}`}
                  >
                    <Icon name={STATUS_ICON[s]} color={current ? STATUS_COLOR[s] : C.faint} size={11} />
                  </AutoLayout>
                )
              })}
            </AutoLayout>
          </AutoLayout>

          {isCelebrating ? (
            <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center" width="fill-parent">
              <Icon name="check" color={C.success} size={11} />
              <Label size={10} weight={600} color={C.success}>
                Done! Moving to Completed…
              </Label>
            </AutoLayout>
          ) : null}

          {open ? <CardDetails task={task} /> : null}
        </AutoLayout>
      </AutoLayout>
    )
  }

  function CardDetails({ task }: { task: Task }) {
    const confirming = confirmDeleteId === task.id
    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={6} padding={{ top: 2 }}>
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
          inputFrameProps={{ padding: { vertical: 4, horizontal: 6 }, fill: C.surface, cornerRadius: 4 }}
        />

        <Row label="Status">
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={STATUS_LABEL[s]}
              icon={STATUS_ICON[s]}
              active={task.status === s}
              color={STATUS_COLOR[s]}
              soft={STATUS_SOFT[s]}
              onClick={() => setStatus(task.id, s)}
            />
          ))}
        </Row>

        <Row label="Due">
          <Chip label="Today" active={task.due === today} onClick={() => setDue(task.id, today)} />
          <Chip label="Tomorrow" active={task.due === addDaysISO(today, 1)} onClick={() => setDue(task.id, addDaysISO(today, 1))} />
          <Chip label="Next Mon" active={task.due === nextMondayISO()} onClick={() => setDue(task.id, nextMondayISO())} />
          <Chip
            label={task.due ? weekdayDate(task.due) : 'Pick date…'}
            icon="calendar"
            active={!!task.due && task.due !== today && task.due !== addDaysISO(today, 1) && task.due !== nextMondayISO()}
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
            fontWeight={500}
            fill={C.text}
            placeholderProps={{ fill: C.faint, italic: true }}
            width={96}
            inputBehavior="truncate"
            inputFrameProps={{ padding: { vertical: 3, horizontal: 7 }, fill: C.bg, stroke: C.border, cornerRadius: 10 }}
          />
          <Chip
            label="Me"
            icon="user"
            tooltip="Assign to me"
            onClick={() => {
              const name = myName()
              if (name) patch(task.id, { assignee: task.assignee === name ? '' : name })
            }}
          />
          {knownAssignees.slice(0, 3).map((a) => (
              <Chip key={a} label={a} active={task.assignee === a} onClick={() => patch(task.id, { assignee: task.assignee === a ? '' : a })} />
            ))}
        </Row>

        <Row label="Priority">
          {PRIORITIES.map((p) => (
            <Chip
              key={p}
              label={PRIORITY_LABEL[p]}
              icon={p === 'high' ? 'flagFilled' : 'flag'}
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
        <AutoLayout width={44}>
          <Label size={9} weight={600} color={C.faint}>
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
          spacing={6}
          padding={{ vertical: 8, horizontal: 4 }}
          fill={C.surface}
          cornerRadius={8}
          horizontalAlignItems="center"
          onClick={() => setCollapsed({ ...collapsed, [status]: false })}
          hoverStyle={{ fill: C.surfaceAlt }}
          tooltip={`Expand ${STATUS_LABEL[status]} (${items.length})`}
        >
          <Icon name="chevronRight" color={C.muted} size={12} />
          <Icon name={STATUS_ICON[status]} color={color} size={14} />
          <CountBadge n={items.length} color={color} />
          <AutoLayout direction="vertical" spacing={0} horizontalAlignItems="center" padding={{ top: 2 }}>
            {STATUS_SHORT[status].split('').map((ch, i) => (
              <Label key={i} size={9} weight={700} color={C.muted}>
                {ch}
              </Label>
            ))}
          </AutoLayout>
        </AutoLayout>
      )
    }

    return (
      <AutoLayout key={status} direction="vertical" width={COL_W} spacing={6} padding={8} fill={C.surface} cornerRadius={8}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
          <Icon name={STATUS_ICON[status]} color={color} size={13} />
          <Label size={11} weight={700} color={C.text}>
            {STATUS_LABEL[status]}
          </Label>
          <CountBadge n={visible.length} color={color} />
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
          <AutoLayout direction="vertical" width="fill-parent" spacing={4}>
            {visible.map((t) => (
              <Card key={t.id} task={t} width="fill-parent" />
            ))}
            {visible.length === 0 ? (
              <AutoLayout width="fill-parent" padding={{ vertical: 6, horizontal: 4 }}>
                <Label size={10} color={C.faint} italic>
                  {items.length > 0 ? 'No matches for current filters.' : status === 'todo' && live.length === 0 ? 'Type below to add your first task.' : 'Nothing here.'}
                </Label>
              </AutoLayout>
            ) : null}
            {/* inline quick add */}
            <Input
              value={null}
              placeholder="+ Add task, press Enter"
              onTextEditEnd={(e) => createTask(e.characters, { status })}
              fontFamily={FONT}
              fontSize={11}
              fill={C.text}
              placeholderProps={{ fill: C.faint }}
              width="fill-parent"
              inputBehavior="wrap"
              inputFrameProps={{
                padding: { vertical: 5, horizontal: 8 },
                fill: C.bg,
                stroke: C.border,
                strokeDashPattern: [3, 2],
                cornerRadius: 6,
                hoverStyle: { stroke: C.accent },
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
        spacing={6}
        padding={{ vertical: 4, horizontal: 6 }}
        fill={C.bg}
        cornerRadius={5}
        stroke={C.border}
        verticalAlignItems="center"
        hoverStyle={{ stroke: C.borderStrong }}
      >
        <Icon name={task.archived ? 'archive' : 'checkFilled'} color={task.archived ? C.faint : C.success} size={13} />
        <AutoLayout direction="vertical" width="fill-parent" spacing={1}>
          <Label size={11} weight={500} color={C.muted} strike={!task.archived} width="fill-parent" truncate>
            {task.title}
          </Label>
          {compact ? null : (
            <Label size={9} color={C.faint} width="fill-parent" truncate>
              {[
                task.assignee ? `@${task.assignee}` : 'Unassigned',
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
        ) : null}
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
    const groups: Array<{ key: string; title: string; sub?: string; items: Task[]; tone?: string }> = []
    const overdue = pool.filter((t) => t.due && daysFromToday(t.due) < 0)
    if (overdue.length) groups.push({ key: 'overdue', title: 'Overdue', items: overdue, tone: C.danger })
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(today, i)
      const items = pool.filter((t) => t.due === iso)
      groups.push({ key: iso, title: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayDate(iso).split(',')[0], sub: weekdayDate(iso), items })
    }
    const later = pool.filter((t) => t.due && daysFromToday(t.due) > 6)
    if (later.length) groups.push({ key: 'later', title: 'Later', items: later })
    const undated = pool.filter((t) => !t.due)
    groups.push({ key: 'none', title: 'No due date', sub: 'Click a card’s calendar icon to schedule', items: undated })

    return (
      <AutoLayout direction="vertical" spacing={8} width={BOARD_W}>
        {groups.map((g) => (
          <AutoLayout key={g.key} direction="vertical" width="fill-parent" spacing={6} padding={8} fill={C.surface} cornerRadius={8}>
            <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
              {g.key === 'overdue' ? <Icon name="alert" color={C.danger} size={12} /> : <Icon name="calendar" color={C.muted} size={12} />}
              <Label size={11} weight={700} color={g.tone ?? C.text}>
                {g.title}
              </Label>
              {g.sub ? (
                <Label size={10} color={C.faint}>
                  {g.sub}
                </Label>
              ) : null}
              <CountBadge n={g.items.length} color={g.tone} />
            </AutoLayout>
            {g.items.length ? (
              <AutoLayout direction="horizontal" width="fill-parent" spacing={6} wrap verticalAlignItems="start">
                {g.items.map((t) => (
                  <Card key={t.id} task={t} width={CARD_W} showStatus />
                ))}
              </AutoLayout>
            ) : (
              <Label size={10} color={C.faint} italic>
                Nothing scheduled.
              </Label>
            )}
          </AutoLayout>
        ))}
      </AutoLayout>
    )
  }

  function DoneView() {
    const q = doneSearch.trim().toLowerCase()
    const pool = (showArchived ? all.filter((t) => t.archived || t.status === 'done') : done)
      .filter(matches)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.assignee.toLowerCase().includes(q))
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))

    return (
      <AutoLayout direction="vertical" spacing={8} width={BOARD_W}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={8} verticalAlignItems="center">
          <AutoLayout direction="horizontal" spacing={6} verticalAlignItems="center" padding={{ vertical: 4, horizontal: 8 }} fill={C.bg} stroke={C.border} cornerRadius={6} width={260}>
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
          <Chip label={`Show archived (${archived.length})`} icon="archive" active={showArchived} onClick={() => setShowArchived(!showArchived)} />
          <AutoLayout width="fill-parent" height={1} />
          <Btn small label="Archive done > 14 days" icon="archive" onClick={archiveOld} tooltip="Move completed tasks older than 14 days to the archive" />
        </AutoLayout>

        <AutoLayout direction="vertical" width="fill-parent" spacing={4} padding={8} fill={C.surface} cornerRadius={8}>
          <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
            <Icon name="checkCircle" color={C.success} size={13} />
            <Label size={11} weight={700}>
              {showArchived ? 'Completed & archived' : 'Completed'}
            </Label>
            <CountBadge n={pool.length} color={C.success} />
          </AutoLayout>
          {pool.length ? (
            pool.map((t) => <DoneRow key={t.id} task={t} />)
          ) : (
            <Label size={10} color={C.faint} italic>
              {q || anyFilter ? 'No completed tasks match.' : 'No completed tasks yet — mark a card done with its check circle.'}
            </Label>
          )}
        </AutoLayout>
      </AutoLayout>
    )
  }

  // ---------------------------------------------------------------- panels
  function QuickAddPanel() {
    return (
      <AutoLayout direction="vertical" width="fill-parent" spacing={6} padding={8} fill={C.accentSoft} cornerRadius={8} stroke={C.accent} strokeWidth={1}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={6} verticalAlignItems="center">
          <Input
            value={null}
            placeholder="New task title — press Enter to add, then type the next one"
            onTextEditEnd={(e) =>
              createTask(e.characters, { status: draft.status, priority: draft.priority, due: draft.due, assignee: draft.assignee })
            }
            fontFamily={FONT}
            fontSize={12}
            fontWeight={500}
            fill={C.text}
            placeholderProps={{ fill: C.faint, fontWeight: 400 }}
            width="fill-parent"
            inputBehavior="wrap"
            inputFrameProps={{ padding: { vertical: 6, horizontal: 8 }, fill: C.bg, stroke: C.accent, cornerRadius: 6 }}
          />
          <IconBtn icon="x" tooltip="Close quick add" onClick={() => setQuickAddOpen(false)} />
        </AutoLayout>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={10} wrap verticalAlignItems="center">
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            {ACTIVE_STATUSES.map((s) => (
              <Chip key={s} label={STATUS_LABEL[s]} icon={STATUS_ICON[s]} active={draft.status === s} color={STATUS_COLOR[s]} soft={STATUS_SOFT[s]} onClick={() => setDraft({ ...draft, status: s })} />
            ))}
          </AutoLayout>
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            <Chip label="Today" active={draft.due === today} onClick={() => setDraft({ ...draft, due: draft.due === today ? null : today })} />
            <Chip label="Tomorrow" active={draft.due === addDaysISO(today, 1)} onClick={() => setDraft({ ...draft, due: draft.due === addDaysISO(today, 1) ? null : addDaysISO(today, 1) })} />
            <Chip label="Next Mon" active={draft.due === nextMondayISO()} onClick={() => setDraft({ ...draft, due: draft.due === nextMondayISO() ? null : nextMondayISO() })} />
            <Chip
              label={draft.due && draft.due !== today && draft.due !== addDaysISO(today, 1) && draft.due !== nextMondayISO() ? weekdayDate(draft.due) : 'Pick…'}
              icon="calendar"
              active={!!draft.due && draft.due !== today && draft.due !== addDaysISO(today, 1) && draft.due !== nextMondayISO()}
              onClick={() => pickDate('New task', draft.due, (iso) => setDraft({ ...draft, due: iso }))}
            />
          </AutoLayout>
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            {PRIORITIES.map((p) => (
              <Chip key={p} label={PRIORITY_LABEL[p]} icon={p === 'high' ? 'flagFilled' : 'flag'} active={draft.priority === p} color={PRIORITY_COLOR[p]} soft={PRIORITY_SOFT[p]} onClick={() => setDraft({ ...draft, priority: draft.priority === p ? null : p })} />
            ))}
          </AutoLayout>
          <AutoLayout direction="horizontal" spacing={4} verticalAlignItems="center">
            <Input
              value={draft.assignee || null}
              placeholder="Assignee"
              onTextEditEnd={(e) => setDraft({ ...draft, assignee: e.characters.trim() })}
              fontFamily={FONT}
              fontSize={10}
              fontWeight={500}
              fill={C.text}
              placeholderProps={{ fill: C.faint, italic: true }}
              width={88}
              inputBehavior="truncate"
              inputFrameProps={{ padding: { vertical: 3, horizontal: 7 }, fill: C.bg, stroke: C.border, cornerRadius: 10 }}
            />
            <Chip
              label="Me"
              icon="user"
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
      <AutoLayout direction="vertical" width="fill-parent" spacing={6} padding={8} fill={C.bg} cornerRadius={8} stroke={C.border}>
        <AutoLayout direction="horizontal" width="fill-parent" spacing={10} wrap verticalAlignItems="center">
          <FilterGroup label="Quick">
            <Chip label={`Overdue (${overdueCount})`} icon="alert" color={C.danger} soft={C.dangerSoft} active={filters.due === 'overdue'} onClick={() => toggleFilter('due', 'overdue')} />
            <Chip label={`Unassigned (${unassignedCount})`} icon="user" active={filters.assignee === '__none__'} onClick={() => toggleFilter('assignee', '__none__')} dashed />
            <Chip label={`Stale in To Do ${staleDays}d+ (${staleCount})`} icon="clock" color={C.warn} soft={C.warnSoft} active={filters.stale} onClick={() => setFilter('stale', !filters.stale)} />
          </FilterGroup>
          <FilterGroup label="Due">
            <Chip label="Today" active={filters.due === 'today'} onClick={() => toggleFilter('due', 'today')} />
            <Chip label="This week" active={filters.due === 'week'} onClick={() => toggleFilter('due', 'week')} />
            <Chip label="No date" active={filters.due === 'none'} onClick={() => toggleFilter('due', 'none')} />
          </FilterGroup>
          <FilterGroup label="Priority">
            {PRIORITIES.map((p) => (
              <Chip key={p} label={PRIORITY_LABEL[p]} icon={p === 'high' ? 'flagFilled' : 'flag'} color={PRIORITY_COLOR[p]} soft={PRIORITY_SOFT[p]} active={filters.priority === p} onClick={() => toggleFilter('priority', p)} />
            ))}
          </FilterGroup>
          <FilterGroup label="Status">
            {STATUSES.map((s) => (
              <Chip key={s} label={STATUS_LABEL[s]} icon={STATUS_ICON[s]} color={STATUS_COLOR[s]} soft={STATUS_SOFT[s]} active={filters.status === s} onClick={() => toggleFilter('status', s)} />
            ))}
          </FilterGroup>
          {knownAssignees.length ? (
            <FilterGroup label="Assignee">
              {knownAssignees.map((a) => (
                <Chip key={a} label={a} icon="user" active={filters.assignee === a} onClick={() => toggleFilter('assignee', a)} />
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
        spacing={4}
        padding={{ vertical: 4, horizontal: 8 }}
        cornerRadius={5}
        fill={on ? C.bg : undefined}
        stroke={on ? C.border : undefined}
        verticalAlignItems="center"
        onClick={() => setView(id)}
        hoverStyle={{ fill: on ? C.bg : C.surfaceAlt }}
      >
        <Icon name={iconName} color={on ? C.text : C.muted} size={11} />
        <Label size={11} weight={on ? 600 : 500} color={on ? C.text : C.muted}>
          {label}
        </Label>
        {count !== undefined && count > 0 ? <CountBadge n={count} /> : null}
      </AutoLayout>
    )
  }

  // ----------------------------------------------------------------- header
  const summary = [
    `${active.length} active`,
    overdueCount ? `${overdueCount} overdue` : null,
    active.filter((t) => t.status === 'blocked').length ? `${active.filter((t) => t.status === 'blocked').length} blocked` : null,
    `${done.length} done`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <AutoLayout direction="vertical" spacing={8} padding={10} fill={C.bg} cornerRadius={12} stroke={C.border} strokeWidth={1} width="hug-contents">
      {/* Header */}
      <AutoLayout direction="horizontal" width={BOARD_W} spacing={8} verticalAlignItems="center">
        <AutoLayout direction="vertical" spacing={0}>
          <Input
            value={boardTitle}
            placeholder="Board title"
            onTextEditEnd={(e) => setBoardTitle(e.characters.trim() || 'Team tasks')}
            fontFamily={FONT}
            fontSize={13}
            fontWeight={700}
            fill={C.text}
            width={180}
            inputBehavior="truncate"
            inputFrameProps={{ padding: 0 }}
          />
          <Label size={10} color={C.muted}>
            {summary}
          </Label>
        </AutoLayout>

        <AutoLayout direction="horizontal" spacing={2} padding={2} fill={C.surface} cornerRadius={6}>
          <ViewTab id="board" label="Board" iconName="board" />
          <ViewTab id="week" label="Week" iconName="week" />
          <ViewTab id="done" label="Done" iconName="checkCircle" count={done.length} />
        </AutoLayout>

        <AutoLayout width="fill-parent" height={1} />

        <AutoLayout direction="horizontal" spacing={6} verticalAlignItems="center" padding={{ vertical: 4, horizontal: 8 }} fill={C.bg} stroke={search ? C.accent : C.border} cornerRadius={6} width={200}>
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
        <AutoLayout direction="horizontal" width={BOARD_W} spacing={8} padding={{ vertical: 6, horizontal: 8 }} fill={C.surface} cornerRadius={8} verticalAlignItems="center">
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
