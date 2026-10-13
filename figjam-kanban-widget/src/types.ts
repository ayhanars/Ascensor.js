export type Status = 'todo' | 'inprogress' | 'blocked' | 'done'
export type Priority = 'low' | 'medium' | 'high'
export type View = 'board' | 'week' | 'done' | 'sync'
export type SortMode = 'due' | 'priority' | 'created'
export type DueFilter = 'overdue' | 'today' | 'week' | 'none'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  status: Status
  assignee: string
  /** ISO date string YYYY-MM-DD or null */
  due: string | null
  priority: Priority | null
  /** Project / topic labels, free text, coloured deterministically. */
  labels?: string[]
  subtasks?: Subtask[]
  /** Flagged for the next team sync; optional talking point. */
  discuss?: boolean
  discussNote?: string
  createdAt: number
  updatedAt: number
  completedAt: number | null
  archived: boolean
}

/** A collaborator we have seen interact with the board (name → photo). */
export interface Person {
  name: string
  photoUrl: string | null
  seenAt: number
}

export interface Filters {
  assignee: string | null // '__none__' means unassigned
  priority: Priority | null
  due: DueFilter | null
  status: Status | null
  stale: boolean
  label?: string | null
}

export interface Draft {
  status: Status
  priority: Priority | null
  due: string | null
  assignee: string
  label?: string | null
}

export const EMPTY_FILTERS: Filters = {
  assignee: null,
  priority: null,
  due: null,
  status: null,
  stale: false,
  label: null,
}

export const STATUSES: Status[] = ['todo', 'inprogress', 'blocked', 'done']
export const ACTIVE_STATUSES: Status[] = ['todo', 'inprogress', 'blocked']
export const PRIORITIES: Priority[] = ['low', 'medium', 'high']

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}

export const STATUS_SHORT: Record<Status, string> = {
  todo: 'TODO',
  inprogress: 'DOING',
  blocked: 'BLOCKED',
  done: 'DONE',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 }
