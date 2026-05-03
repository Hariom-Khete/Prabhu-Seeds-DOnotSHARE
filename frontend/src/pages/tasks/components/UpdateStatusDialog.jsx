import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import toast from 'react-hot-toast'
import { useDeleteTask, useSubmitRecord } from '../hooks/useTasks'
import TaskStatusBadge from './TaskStatusBadge'

// ── Manager / Owner view — delete task ─────────────────────────────────────

function DeleteView({ task, onDone }) {
  const deleteTask = useDeleteTask()
  const [confirmed, setConfirmed] = useState(false)

  async function handleDelete() {
    try {
      await toast.promise(deleteTask.mutateAsync(task.id), {
        loading: 'Deleting task…',
        success: 'Task deleted.',
        error: (err) => err.response?.data?.detail ?? 'Failed to delete task',
      })
      onDone()
    } catch {
      // toast already shown
    }
  }

  const repeatCount = task.repeat_count ?? 1
  const recordCount = task.record_count ?? 0

  return (
    <div className="space-y-5">
      {/* Task summary */}
      <div className="bg-surface-container-low p-4 space-y-2">
        <div className="flex items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <span className="font-mono text-xs text-on-surface-variant">#{String(task.id).padStart(4, '0')}</span>
        </div>
        <p className="font-bold text-on-surface">{task.title}</p>
        {repeatCount > 1 && (
          <p className="text-xs text-on-surface-variant">
            Completions: <span className="font-semibold text-on-surface">{recordCount} / {repeatCount}</span>
          </p>
        )}
      </div>

      {!confirmed ? (
        <>
          <p className="text-sm text-on-surface-variant">
            Update the task status or permanently delete it. Deletion cannot be undone.
          </p>
          <div className="flex gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex-1 py-2.5 border border-outline-variant/30 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="flex-1 py-2.5 bg-error text-white text-sm font-bold uppercase tracking-wider hover:opacity-90"
            >
              Delete Task
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="bg-error/10 border border-error/20 p-4 rounded">
            <p className="text-sm font-semibold text-error mb-1">This action is permanent.</p>
            <p className="text-xs text-on-surface-variant">
              Deleting will remove the task and all {recordCount} completion record{recordCount !== 1 ? 's' : ''}.
              This cannot be undone.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmed(false)}
              className="flex-1 py-2.5 border border-outline-variant/30 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
            >
              Go Back
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteTask.isPending}
              className="flex-1 py-2.5 bg-error text-white text-sm font-bold uppercase tracking-wider disabled:opacity-50 hover:opacity-90"
            >
              {deleteTask.isPending ? 'Deleting…' : 'Yes, Delete'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Field role view — submit completion ─────────────────────────────────────

function CompletionView({ task, onDone }) {
  const submitRecord = useSubmitRecord()
  const [gpsNote, setGpsNote] = useState(null)

  const repeatCount = task.repeat_count ?? 1
  // Use the requesting user's own submission count so the counter reflects
  // their personal progress (important for group tasks).
  const recordCount = task.my_record_count ?? task.record_count ?? 0
  const nextNum = recordCount + 1
  const isRepetitive = repeatCount > 1
  const allDone = recordCount >= repeatCount
  const pct = Math.min(100, Math.round((recordCount / repeatCount) * 100))

  async function captureGps() {
    if (!navigator.geolocation) return { lat: null, lng: null }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { timeout: 8000, maximumAge: 0 },
      )
    })
  }

  async function handleSubmit() {
    setGpsNote('📍 Capturing location…')
    const { lat, lng } = await captureGps()
    setGpsNote(lat ? `📍 Location captured (${lat.toFixed(4)}, ${lng.toFixed(4)})` : null)

    try {
      await toast.promise(
        submitRecord.mutateAsync({ taskId: task.id, lat, lng }),
        {
          loading: isRepetitive ? `Submitting completion #${nextNum}…` : 'Marking as completed…',
          success: allDone || nextNum >= repeatCount
            ? 'Task fully completed!'
            : `Completion #${nextNum} recorded.`,
          error: (err) => err.response?.data?.detail ?? 'Failed to submit completion',
        }
      )
      onDone()
    } catch {
      // toast already shown
    }
  }

  if (allDone) {
    return (
      <div className="space-y-4 text-center py-4">
        <span className="text-5xl">✓</span>
        <p className="font-bold text-green-700">All {repeatCount} repetitions completed!</p>
        <Dialog.Close asChild>
          <button
            type="button"
            className="w-full py-2.5 bg-surface-container text-sm font-semibold text-on-surface-variant"
          >
            Close
          </button>
        </Dialog.Close>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Task summary */}
      <div className="bg-surface-container-low p-4 space-y-2">
        <div className="flex items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <span className="font-mono text-xs text-on-surface-variant">#{String(task.id).padStart(4, '0')}</span>
        </div>
        <p className="font-bold text-on-surface">{task.title}</p>
        {task.activity_type && (
          <p className="text-xs text-on-surface-variant">{task.activity_type}</p>
        )}
      </div>

      {isRepetitive ? (
        /* Repetitive task — show progress */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-on-surface">
              Submitting completion <span className="text-primary font-black">#{nextNum}</span> of {repeatCount}
            </p>
            <span className="text-xs font-bold text-on-surface-variant">{pct}% done</span>
          </div>
          <div className="h-2 bg-outline-variant/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.min(repeatCount, 20) }).map((_, i) => (
              <span
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                  i < recordCount
                    ? 'bg-green-600 border-green-600 text-white'
                    : i === recordCount
                    ? 'bg-primary border-primary text-on-primary ring-2 ring-primary/30'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {i + 1}
              </span>
            ))}
            {repeatCount > 20 && (
              <span className="text-xs text-on-surface-variant self-center">+{repeatCount - 20} more</span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">
            {repeatCount - nextNum} more completion{repeatCount - nextNum !== 1 ? 's' : ''} remaining after this.
          </p>
        </div>
      ) : (
        /* Single task */
        <div className="bg-green-50 border border-green-200 p-4 rounded text-center">
          <p className="text-sm font-semibold text-green-800">Mark this task as completed?</p>
          <p className="text-xs text-green-700 mt-1">This will close the task for this assignment.</p>
        </div>
      )}

      {gpsNote && (
        <p className="text-xs text-on-surface-variant">{gpsNote}</p>
      )}

      <div className="flex gap-3">
        <Dialog.Close asChild>
          <button
            type="button"
            className="flex-1 py-2.5 border border-outline-variant/30 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
        </Dialog.Close>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitRecord.isPending}
          className="flex-1 py-2.5 bg-green-700 text-white text-sm font-bold uppercase tracking-wider disabled:opacity-50 hover:opacity-90"
        >
          {submitRecord.isPending
            ? 'Submitting…'
            : isRepetitive
            ? `Submit Completion #${nextNum}`
            : 'Mark as Completed'}
        </button>
      </div>
    </div>
  )
}

// ── Root dialog ─────────────────────────────────────────────────────────────

export default function UpdateStatusDialog({ task, open, onOpenChange, role }) {
  if (!task) return null

  const isManager = role === 'owner' || role === 'manager'
  const title = isManager ? 'Update / Delete Task' : 'Submit Completion'

  function handleDone() {
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-on-surface/35 z-40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-surface-container-lowest shadow-ghost p-6
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-xl font-black font-headline text-on-surface tracking-tight">
              {title}
            </Dialog.Title>
            <Dialog.Close
              className="text-on-surface-variant hover:text-on-surface text-xl leading-none"
              aria-label="Close"
            >
              &times;
            </Dialog.Close>
          </div>

          {isManager
            ? <DeleteView task={task} onDone={handleDone} />
            : <CompletionView task={task} onDone={handleDone} />
          }
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
