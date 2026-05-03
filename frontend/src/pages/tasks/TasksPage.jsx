import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO, isPast } from 'date-fns'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import DashboardShell from '@/components/layout/DashboardShell'
import { useTasks } from './hooks/useTasks'
import { useExportTasks } from './hooks/useExportTasks'
import { useAuthStore } from '@/store/authStore'
import TaskStatusBadge from './components/TaskStatusBadge'
import CreateTaskDialog from './components/CreateTaskDialog'
import EditTaskDialog from './components/EditTaskDialog'
import UpdateStatusDialog from './components/UpdateStatusDialog'
import TaskDetailSheet from './components/TaskDetailSheet'

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { label: 'All',         value: '' },
  { label: 'Assigned',    value: 'assigned' },
  { label: 'In Progress', value: 'running' },
  { label: 'On Hold',     value: 'hold' },
  { label: 'Completed',   value: 'completed' },
]

const DEPARTMENTS = [
  'All Departments',
  'Marketing',
  'Production',
  'R&D',
  'Processing',
  'Field Ops',
]

const columnHelper = createColumnHelper()

// ── Avatar chip ────────────────────────────────────────────────────────────

function Avatar({ name }) {
  const initials = name
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?'
  return (
    <span className="inline-flex w-7 h-7 rounded-full bg-primary-container text-on-primary items-center justify-center text-[10px] font-bold mr-2">
      {initials}
    </span>
  )
}

// ── Column defs ────────────────────────────────────────────────────────────

function buildColumns(onView, onAssign, role) {
  const normalizedRole = (role ?? '').toLowerCase()
  const isManager = normalizedRole === 'owner' || normalizedRole === 'manager'
  return [
    columnHelper.accessor('id', {
      header: 'Task ID',
      cell: (info) => (
        <span className="font-mono text-sm text-primary font-semibold">
          #{String(info.getValue()).padStart(4, '0')}
        </span>
      ),
    }),
    columnHelper.accessor('activity_type', {
      header: 'Activity Type',
      cell: (info) => (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
          <span className="font-medium text-gray-800">{info.getValue() ?? '—'}</span>
        </div>
      ),
    }),
    columnHelper.accessor('assigned_to_name', {
      header: 'Assigned To',
      cell: (info) => {
        const name = info.getValue() ?? '—'
        return (
          <div className="flex items-center">
            <Avatar name={name} />
            <span className="text-sm text-on-surface-variant">{name}</span>
          </div>
        )
      },
    }),
    columnHelper.accessor('dept', {
      header: 'Department',
      cell: (info) => {
        const val = info.getValue()
        if (!val) return <span className="text-on-surface-variant text-sm">—</span>
        return (
          <span className="text-[10px] font-bold text-outline uppercase border border-outline-variant/30 px-2 py-0.5">
            {val}
          </span>
        )
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => <TaskStatusBadge status={info.getValue()} />,
    }),
    columnHelper.accessor('deadline', {
      header: 'Deadline',
      cell: (info) => {
        const raw = info.getValue()
        if (!raw) return <span className="text-on-surface-variant text-sm">—</span>
        const date = parseISO(raw)
        const overdue = isPast(date) && info.row.original.status !== 'completed'
        return (
          <span className={`font-mono text-sm ${overdue ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
            {format(date, 'MMM d, yyyy')}
          </span>
        )
      },
    }),
    columnHelper.accessor('repeat_count', {
      header: 'Repetitions',
      cell: (info) => {
        const task = info.row.original
        const total = info.getValue() ?? 1

        // ── Group task, manager/owner: overall % bar ──
        if (task.assignment_type === 'group' && isManager) {
          const memberIds   = task.members ?? []
          // record_count is always accurate (counted from DB rows by the backend).
          // member_completions can be empty on first load, so don't rely on it for the %.
          const totalDone   = task.record_count ?? 0
          const totalNeeded = memberIds.length > 0 ? memberIds.length * total : total
          const pct     = Math.min(100, Math.round((totalDone / totalNeeded) * 100))
          const allDone = totalDone >= totalNeeded

          return (
            <div className="min-w-[100px]">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold ${allDone ? 'text-green-600' : 'text-on-surface'}`}>
                  {pct}%
                </span>
                <span className="text-[10px] text-on-surface-variant">Group</span>
              </div>
              <div className="h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${allDone ? 'bg-green-600' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        }

        // ── Singular task OR field staff on a group task: single bar ──
        // Field staff see their own count; managers see the total.
        const done = isManager
          ? (task.record_count ?? 0)
          : (task.my_record_count ?? 0)
        const pct      = Math.min(100, Math.round((done / total) * 100))
        const complete = done >= total
        return (
          <div className="min-w-[90px]">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-bold ${complete ? 'text-green-600' : 'text-on-surface'}`}>
                {done} / {total}
              </span>
              {total > 1 && (
                <span className={`text-[10px] font-semibold ${complete ? 'text-green-600' : 'text-on-surface-variant'}`}>
                  {pct}%
                </span>
              )}
            </div>
            {total > 1 && (
              <div className="h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${complete ? 'bg-green-600' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onView(row.original) }}
            className="p-1 hover:bg-surface-container rounded transition-colors"
            aria-label="View"
          >
            <span className="material-symbols-outlined text-sm text-on-surface-variant" aria-hidden="true">visibility</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onAssign(row.original) }}
            className="p-1 hover:bg-surface-container rounded transition-colors"
            aria-label="Assign"
          >
            <span className="material-symbols-outlined text-sm text-on-surface-variant" aria-hidden="true">person_add</span>
          </button>
        </div>
      ),
    }),
  ]
}

// ── Filter bar ─────────────────────────────────────────────────────────────

function FilterBar({ params, setParam }) {
  const status = params.get('status') ?? ''
  const dept = params.get('dept') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? ''
  const search = params.get('search') ?? ''

  return (
    <div className="space-y-3">
      {/* Status tabs + Department */}
      <div className="flex flex-wrap items-center gap-3 md:gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Task Status</span>
          <div className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setParam('status', tab.value)}
                className={`px-4 py-1.5 text-xs font-bold transition-colors ${
                status === tab.value
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:bg-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
          </div>
        </div>

        <div className="h-8 w-px bg-outline-variant/30 hidden md:block" />

        <div className="flex items-center gap-2 md:ml-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Department</span>
          <select
            value={dept}
            onChange={(e) =>
              setParam('dept', e.target.value === 'All Departments' ? '' : e.target.value)
            }
            className="bg-surface-container-lowest border-none text-xs font-bold py-1.5 pl-3 pr-8 focus:ring-1 focus:ring-primary min-w-[160px]"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d === 'All Departments' ? '' : d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search + Date range */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 md:min-w-[300px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg" aria-hidden="true">search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            placeholder="Search by village, staff name…"
            className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border-none text-sm placeholder:text-outline-variant/70 focus:ring-1 focus:ring-primary"
          />
        </div>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setParam('dateFrom', e.target.value)}
          aria-label="From date"
          className="bg-surface-container-lowest border-none text-xs font-bold py-2 px-3 focus:ring-1 focus:ring-primary"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setParam('dateTo', e.target.value)}
          aria-label="To date"
          className="bg-surface-container-lowest border-none text-xs font-bold py-2 px-3 focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  )
}

// ── Stats bar ──────────────────────────────────────────────────────────────

function StatsBar({ meta }) {
  if (!meta) return null
  const stats = [
    { label: 'Total Tasks', value: meta.total?.toLocaleString(), color: 'bg-primary' },
    { label: 'Pending Ops', value: meta.pending, color: 'bg-amber-500' },
    { label: 'Active Deployments', value: meta.active, color: 'bg-blue-500' },
    { label: 'Efficiency Rating', value: `${meta.efficiency}%`, color: 'bg-primary-container' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface-container-lowest shadow-ghost relative px-5 py-4">
          <span className={`absolute left-0 top-0 h-full w-1 ${s.color}`} aria-hidden="true" />
          <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">
            {s.label}
          </p>
          <p className="text-2xl font-black text-on-surface font-headline tracking-tight">{s.value ?? '—'}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [editTask, setEditTask] = useState(null)
  const [actionTask, setActionTask] = useState(null)

  const user = useAuthStore((s) => s.user)
  const canCreate = ['owner', 'manager'].includes(user?.role)

  // Build filter object from URL params — keys must match backend query param names
  const filters = {
    status:    searchParams.get('status') ?? '',
    dept:      searchParams.get('dept') ?? '',
    date_from: searchParams.get('dateFrom') ?? '',
    date_to:   searchParams.get('dateTo') ?? '',
    search:    searchParams.get('search') ?? '',
  }

  const { data, isLoading, isError } = useTasks(filters)
  const { startExport, exporting } = useExportTasks(filters)

  // Backend returns { tasks: [...], meta: {...} }
  const tasks = data?.tasks ?? []
  const meta  = data?.meta

  function setParam(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  // Stable callbacks so columns array reference doesn't change every render
  const handleView   = useCallback((task) => setSelectedTask(task), [])
  const handleAssign = useCallback((task) => setSelectedTask(task), [])
  const columns = useMemo(
    () => buildColumns(handleView, handleAssign, user?.role),
    [handleView, handleAssign, user?.role],
  )

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-black font-headline text-on-surface tracking-tighter">Task Registry</h1>
            <p className="text-on-surface-variant mt-1 font-medium">
              Global operational ledger and task distribution.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={startExport}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
              aria-label="Export CSV"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>

            {canCreate && (
              <button
                onClick={() => setCreateOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-8 py-4 font-bold uppercase tracking-[0.1em] text-sm shadow-sm flex items-center gap-3 hover:opacity-90"
                aria-label="Create Task"
              >
                <span className="material-symbols-outlined" aria-hidden="true">add_task</span>
                Create Task
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-surface-container-low p-4">
          <FilterBar params={searchParams} setParam={setParam} />
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest overflow-hidden shadow-ghost">
          {isError && (
            <div className="p-8 text-center text-error text-sm">
              Failed to load tasks. Please try again.
            </div>
          )}

          {isLoading && (
            <div className="p-8 text-center text-on-surface-variant text-sm animate-pulse">
              Loading tasks…
            </div>
          )}

          {!isLoading && !isError && (
            <table className="w-full text-left">
              <thead className="bg-surface-container-high border-b border-outline-variant/10">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ${header.id === 'due_date' || header.id === 'actions' ? 'text-right' : ''}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-12 text-center text-on-surface-variant text-sm"
                    >
                      No tasks found.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-surface-container-low/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedTask(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className={`px-6 py-5 ${cell.column.id === 'due_date' || cell.column.id === 'actions' ? 'text-right' : ''}`}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Stats */}
        <StatsBar meta={meta} />
      </div>

      {/* Dialogs */}
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />

      <EditTaskDialog
        task={editTask}
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(null)}
      />

      <UpdateStatusDialog
        task={actionTask}
        open={!!actionTask}
        onOpenChange={(open) => !open && setActionTask(null)}
        role={user?.role?.toLowerCase()}
      />

      <TaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onReassign={(task) => { setSelectedTask(null); setEditTask(task) }}
        onUpdateStatus={(task) => { setSelectedTask(null); setActionTask(task) }}
      />
    </DashboardShell>
  )
}
