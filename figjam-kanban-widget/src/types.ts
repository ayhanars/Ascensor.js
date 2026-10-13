export type Status = 'todo' | 'inprogress' | 'blocked' | 'done'
export type Priority = 'low' | 'medium' | 'high'
export type View = 'board' | 'week' | 'done'
export type SortMode = 'due' | 'priority' | 'created'
export type DueFilter = 'overdue' | 'today' | 'week' | 'none'

export interface Task {
  id: string
  title: string
  description: string
  status: Status
  assignee: string
  /** ISO date string YYYY-MM-DD or null */
  due: string | null
  priority: Priority | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
  archived: boolean
}

export interface Filters {
  assignee: string | null // '__none__' means unassigned
  priority: Priority | null
  due: DueFilter | null
  status: Status | null
  stale: boolean
}

export interface Draft {
  status: Status
  priority: Priority | null
  due: string | null
  assignee: string
}

export const EMPTY_FILTERS: Filters = {
  assignee: null,
  priority: null,
  due: null,
  status: null,
  stale: false,
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
