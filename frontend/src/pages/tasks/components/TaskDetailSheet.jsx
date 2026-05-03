import { format, parseISO, isPast } from 'date-fns'
import * as Dialog from '@radix-ui/react-dialog'
import { useAuthStore } from '@/store/authStore'
import TaskStatusBadge from './TaskStatusBadge'
import { useTaskRecords } from '../hooks/useTasks'

// ── Primitives ──────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-black tracking-widest text-primary uppercase mb-3 flex items-center gap-2">
      <span className="flex-1 h-px bg-outline-variant/30" />
      {children}
      <span className="flex-1 h-px bg-outline-variant/30" />
    </p>
  )
}

function DataRow({ label, value, accent = false, className = '' }) {
  if (value == null || value === '' || value === '—') {
    return (
      <div className={className}>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-sm text-on-surface-variant/40">—</p>
      </div>
    )
  }
  return (
    <div className={className}>
      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${accent ? 'text-primary' : 'text-on-surface'}`}>{value}</p>
    </div>
  )
}

function Badge({ children, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-600/10 text-green-700',
    error: 'bg-error/10 text-error',
    tertiary: 'bg-tertiary/10 text-tertiary',
  }
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${colors[color]}`}>
      {children}
    </span>
  )
}

// ── Initials helper ─────────────────────────────────────────────────────────

function nameInitials(name) {
  return (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// ── Completion locations (manager/owner) ────────────────────────────────────

function CompletionLocations({ taskId, recordCount }) {
  const { data: records, isLoading } = useTaskRecords(taskId, { enabled: recordCount > 0 })

  if (recordCount === 0) return null

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: Math.min(recordCount, 3) }).map((_, i) => (
          <div key={i} className="h-14 bg-surface-container-low animate-pulse" />
        ))}
      </div>
    )
  }

  if (!records?.length) return null

  return (
    <div className="space-y-2">
      {records.map((rec, i) => {
        const hasLocation = rec.lat != null && rec.lng != null
        const mapsUrl = hasLocation
          ? `https://www.google.com/maps?q=${rec.lat},${rec.lng}`
          : null
        return (
          <div key={rec.id} className="flex items-start gap-3 bg-surface-container-low px-3 py-3">
            <span className="w-6 h-6 bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0 space-y-0.5">
              {/* Submitter name */}
              {rec.submitted_by_name && (
                <p className="text-xs font-bold text-on-surface">{rec.submitted_by_name}</p>
              )}
              {/* Timestamp */}
              <p className="text-xs text-on-surface-variant">
                {rec.submitted_at ? format(parseISO(rec.submitted_at), 'dd MMM yyyy, hh:mm a') : '—'}
              </p>
              {/* GPS location */}
              {hasLocation ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-[13px]">location_on</span>
                  {Number(rec.lat).toFixed(5)}, {Number(rec.lng).toFixed(5)}
                </a>
              ) : (
                <p className="text-xs text-on-surface-variant/50 italic">Location not captured</p>
              )}
              {/* Optional farmer details */}
              {(rec.farmer_name || rec.village) && (
                <p className="text-xs text-on-surface-variant">
                  {[rec.farmer_name, rec.village, rec.district].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main sheet ──────────────────────────────────────────────────────────────

export default function TaskDetailSheet({ task, open, onOpenChange, onReassign, onUpdateStatus }) {
  const role = useAuthStore((s) => s.user?.role?.toLowerCase())
  const isManager = role === 'owner' || role === 'manager'

  if (!task) return null

  const deadline = task.deadline ?? task.due_date
  const isOverdue = deadline && isPast(parseISO(deadline)) && task.status !== 'completed'
  const repeatCount = task.repeat_count ?? 1
  const recordCount = task.record_count ?? 0
  // Field staff see only their own progress; managers/owners see the total
  const displayCount = isManager ? recordCount : (task.my_record_count ?? 0)
  const pct = Math.min(100, Math.round((displayCount / repeatCount) * 100))
  const fullyDone = displayCount >= repeatCount

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-40" />

        <Dialog.Content
          className="fixed right-0 top-0 h-full w-full max-w-md bg-surface-container-lowest z-50 flex flex-col shadow-2xl
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300"
          aria-describedby={undefined}
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-outline-variant/20">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1.5">
                <TaskStatusBadge status={task.status} />
                <span className="text-xs text-on-surface-variant/50 font-mono">#{task.id}</span>
                {task.season && (
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-tertiary/10 text-tertiary">
                    {task.season}
                  </span>
                )}
              </div>
              <Dialog.Title className="text-lg font-black font-headline text-on-surface leading-tight">
                {task.activity_type ?? task.title}
              </Dialog.Title>
              {task.dept && (
                <p className="text-xs font-bold uppercase tracking-widest text-primary mt-0.5">
                  {task.dept}
                </p>
              )}
            </div>
            <Dialog.Close className="text-on-surface-variant hover:text-on-surface text-2xl leading-none" aria-label="Close">
              &times;
            </Dialog.Close>
          </div>

          {/* ── Scrollable body ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* ASSIGNMENT */}
            <section>
              <SectionLabel>Assignment</SectionLabel>
              {task.assignment_type === 'group' ? (
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                    Group Members ({(task.member_names ?? []).length})
                  </p>
                  {(task.member_names ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {task.member_names.map((name, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1">
                          <span className="w-5 h-5 bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center">
                            {nameInitials(name)}
                          </span>
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant/50">No members assigned</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 bg-primary text-on-primary text-sm font-black flex items-center justify-center flex-shrink-0">
                    {nameInitials(task.assigned_to_name ?? task.assigned_to?.name)}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {task.assigned_to_name ?? task.assigned_to?.name ?? 'Unassigned'}
                    </p>
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">ASM / Field Staff</p>
                  </div>
                </div>
              )}
            </section>

            {/* ACTIVITY DETAILS */}
            <section>
              <SectionLabel>Activity Details</SectionLabel>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DataRow label="Department" value={task.dept} accent />
                <DataRow label="Season" value={task.season} accent />
                <DataRow label="Activity" value={task.activity_type} className="col-span-2" />
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Unit</p>
                  <Badge color="primary">{task.unit ?? 'NOS'}</Badge>
                </div>
                <DataRow label="Target Count" value={task.target != null ? `${task.target} ${task.unit ?? 'NOS'}` : null} />
              </div>
            </section>

            {/* CROP & PRODUCT */}
            {(task.crop || task.product) && (
              <section>
                <SectionLabel>Crop &amp; Product</SectionLabel>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <DataRow label="Target Crop" value={task.crop} />
                  <DataRow label="Focus Product" value={task.product} />
                </div>
              </section>
            )}

            {/* LOCATION */}
            <section>
              <SectionLabel>Location</SectionLabel>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DataRow label="State" value={task.state} />
                <DataRow label="ST / Territory" value={task.territory} />
                {task.location && (
                  <DataRow label="Field / Site Location" value={task.location} className="col-span-2" />
                )}
              </div>
            </section>

            {/* TIMELINE */}
            <section>
              <SectionLabel>Timeline</SectionLabel>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {task.month && (
                  <DataRow label="Month" value={(() => {
                    try { return format(parseISO(`${task.month}-01`), 'MMMM yyyy') } catch { return task.month }
                  })()} />
                )}
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-0.5">Deadline</p>
                  {deadline ? (
                    <p className={`text-sm font-semibold ${isOverdue ? 'text-error' : 'text-on-surface'}`}>
                      {format(parseISO(deadline), 'dd MMM yyyy')}
                      {isOverdue && <span className="ml-1 text-[10px] text-error font-black uppercase tracking-widest">Overdue</span>}
                    </p>
                  ) : (
                    <p className="text-sm text-on-surface-variant/40">—</p>
                  )}
                </div>
                <DataRow label="Created" value={task.created_at ? format(parseISO(task.created_at), 'dd MMM yyyy') : null} />
                {task.started_at && (
                  <DataRow label="Started" value={format(parseISO(task.started_at), 'dd MMM yyyy')} />
                )}
              </div>
            </section>

            {/* PROGRESS */}
            <section>
              <SectionLabel>Repetitions Progress</SectionLabel>

              {task.assignment_type === 'group' && isManager && (task.member_names ?? []).length > 0 ? (
                // ── Group task (manager/owner only): one card per member ──
                <div className="space-y-3">
                  {(task.member_names ?? []).map((name, i) => {
                    const memberId   = (task.members ?? [])[i]
                    const done       = memberId ? (task.member_completions?.[String(memberId)] ?? 0) : 0
                    const memberDone = done >= repeatCount
                    const memberPct  = Math.min(100, Math.round((done / repeatCount) * 100))
                    return (
                      <div key={i} className="bg-surface-container-low px-3 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                              {nameInitials(name)}
                            </span>
                            <span className="text-sm font-semibold text-on-surface">{name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${memberDone ? 'text-green-600' : 'text-on-surface'}`}>
                              {done} / {repeatCount}
                            </span>
                            {memberDone && <Badge color="success">Done</Badge>}
                          </div>
                        </div>
                        <div className="h-1.5 bg-surface-container overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${memberDone ? 'bg-green-600' : 'bg-primary/60'}`}
                            style={{ width: `${memberPct}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from({ length: Math.min(repeatCount, 12) }).map((_, j) => (
                            <span
                              key={j}
                              className={`w-5 h-5 flex items-center justify-center text-[9px] font-bold border ${
                                j < done
                                  ? 'bg-primary border-primary text-on-primary'
                                  : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant'
                              }`}
                            >
                              {j + 1}
                            </span>
                          ))}
                          {repeatCount > 12 && (
                            <span className="text-xs text-on-surface-variant self-center">+{repeatCount - 12} more</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                // ── Singular task OR field staff on group task: single bar ──
                <div className="bg-surface-container-low p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-3xl font-black font-headline ${fullyDone ? 'text-primary' : 'text-on-surface'}`}>
                        {displayCount}
                        <span className="text-base font-medium text-on-surface-variant"> / {repeatCount}</span>
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {fullyDone ? 'All repetitions completed' : `${repeatCount - displayCount} remaining`}
                      </p>
                    </div>
                    {fullyDone && <Badge color="success">Complete</Badge>}
                  </div>
                  <div className="h-1.5 bg-surface-container overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${fullyDone ? 'bg-primary' : 'bg-primary/60'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: Math.min(repeatCount, 20) }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-6 h-6 flex items-center justify-center text-[9px] font-bold border ${
                          i < displayCount
                            ? 'bg-primary border-primary text-on-primary'
                            : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant'
                        }`}
                      >
                        {i + 1}
                      </span>
                    ))}
                    {repeatCount > 20 && (
                      <span className="text-xs text-on-surface-variant self-center">+{repeatCount - 20} more</span>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* COMPLETION LOCATIONS — manager / owner only */}
            {isManager && recordCount > 0 && (
              <section>
                <SectionLabel>Completion Locations</SectionLabel>
                <CompletionLocations taskId={task.id} recordCount={recordCount} />
              </section>
            )}

            {/* DESCRIPTION */}
            {task.description && (
              <section>
                <SectionLabel>Instructions / Description</SectionLabel>
                <div className="border-l-4 border-primary pl-4 bg-surface-container-low py-3 pr-3">
                  <p className="text-sm text-on-surface leading-relaxed">{task.description}</p>
                </div>
              </section>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div className="flex gap-3 px-6 py-4 border-t border-outline-variant/20">
            {isManager && (
              <button
                type="button"
                onClick={() => onReassign?.(task)}
                className="flex-1 py-2.5 border border-outline-variant/40 text-sm font-bold text-on-surface-variant hover:bg-surface-container uppercase tracking-wide"
              >
                Edit Task
              </button>
            )}
            <button
              type="button"
              onClick={() => onUpdateStatus?.(task)}
              className={`flex-1 py-2.5 text-sm font-bold uppercase tracking-wide ${
                isManager
                  ? 'bg-error text-white hover:bg-error/90'
                  : 'bg-primary text-on-primary hover:bg-primary/90'
              }`}
            >
              {isManager ? 'Delete Task' : 'Submit Completion'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
