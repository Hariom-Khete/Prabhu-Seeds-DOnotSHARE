import { useCallback, useMemo, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import apiClient from '@/lib/axios'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useTravelHistory } from './hooks/useTravel'
import useTravelJourney from './hooks/useTravelJourney'
import {
  getPendingJourneys,
  addPendingJourney,
  printTravelPDF,
  RATE_PER_KM,
} from '@/utils/travelSheet'
import TravelShell from './components/TravelShell'
import TravelStatusBadge from './components/TravelStatusBadge'
import TravelSkeleton from './components/TravelSkeleton'

// ── Normalise backend response ─────────────────────────────────────────────────

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return isFinite(n) ? n : fallback
}

function normalizeHistory(payload) {
  // API returns a plain array directly
  const rows = Array.isArray(payload)
    ? payload
    : payload?.claims ?? payload?.items ?? payload?.data ?? []
  if (!Array.isArray(rows)) return []
  return rows.map((row, idx) => {
    const status = String(row.status ?? 'pending').toLowerCase()
    return {
      id: row.id ?? row.claim_id ?? `history-${idx}`,
      date: row.date ?? row.travel_date ?? row.created_at,
      amountInr: safeNumber(row.amount_inr ?? row.amount),
      distanceKm: safeNumber(row.distance_km ?? row.distance ?? row.km),
      status,
      description: row.description ?? '',
      updates:
        row.timeline ?? [
          { label: 'Claim Submitted', at: row.created_at ?? row.date, state: 'done' },
          {
            label:
              status === 'approved'
                ? 'Approved by Accounts'
                : status === 'rejected'
                ? 'Rejected by Accounts'
                : 'Under Review',
            at: row.updated_at ?? row.date,
            state: status === 'approved' ? 'done' : status === 'rejected' ? 'blocked' : 'active',
          },
        ],
    }
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${highlight ? 'text-primary text-lg' : 'text-on-surface'}`}>
        {value}
      </p>
    </div>
  )
}

function Timeline({ updates }) {
  if (!updates?.length) return null
  return (
    <ol className="space-y-2">
      {updates.map((update, idx) => (
        <li key={`${update.label}-${idx}`} className="relative pl-6">
          <span
            className={`absolute left-0 top-1 h-2 w-2 rounded-full ${
              update.state === 'done' ? 'bg-primary' : update.state === 'blocked' ? 'bg-error' : 'bg-amber-500'
            }`}
          />
          {idx !== updates.length - 1 && (
            <span className="absolute left-[3px] top-3 h-full w-px bg-outline-variant/40" />
          )}
          <p className="text-xs font-bold text-on-surface">{update.label}</p>
          <p className="text-xs text-on-surface-variant">
            {update.at ? format(new Date(update.at), 'dd MMM yyyy, hh:mm a') : '--'}
          </p>
        </li>
      ))}
    </ol>
  )
}

// ── Journey Tracker ────────────────────────────────────────────────────────────

function JourneyTracker({ user, onJourneyAdded }) {
  const queryClient = useQueryClient()
  const { active, startTime, totalKm, elapsed, gpsError, start, stop } = useTravelJourney()

  // Completed journey waiting for "Save" action
  const [completed, setCompleted] = useState(null)
  const [saving, setSaving] = useState(false)

  // Pending journeys (accumulated, not yet printed)
  const [pending, setPending] = useState(() => getPendingJourneys())
  const [printing, setPrinting] = useState(false)

  const refreshPending = useCallback(() => setPending(getPendingJourneys()), [])

  function handleStart() {
    setCompleted(null)
    start()
    toast.success('Journey started — GPS is tracking.')
  }

  function handleStop() {
    if (!startTime) return   // guard: can't stop a journey that never started
    const endTime = Date.now()
    stop()
    setCompleted({ startTime, endTime, totalKm })
  }

  async function handleSave() {
    if (!completed) return
    setSaving(true)
    try {
      const { startTime: st, endTime, totalKm: km } = completed
      // Use at least ₹1 so backend doesn't reject a zero-amount record
      const amount  = Math.max(parseFloat((km * RATE_PER_KM).toFixed(2)), 1)
      const depTime = format(new Date(st), 'HH:mm')
      const arrTime = format(new Date(endTime), 'HH:mm')

      // Save to backend
      await apiClient.post('/api/v1/expenses/', {
        date: format(new Date(st), 'yyyy-MM-dd'),
        type: 'travel',
        description: `Journey on ${format(new Date(st), 'dd MMM yyyy')} | Dep: ${depTime} → Arr: ${arrTime}`,
        amount,
        km: parseFloat(Math.max(km, 0).toFixed(2)),
        rate: RATE_PER_KM,
      })

      // Add to local pending list (for sheet accumulation)
      addPendingJourney(completed)
      refreshPending()
      queryClient.invalidateQueries({ queryKey: ['travel-history'] })
      onJourneyAdded?.()

      toast.success('Journey saved! It will be included in the next sheet print.')
      setCompleted(null)
    } catch (err) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Failed to save journey.'
      toast.error(detail)
    } finally {
      setSaving(false)
    }
  }

  async function handlePrint() {
    if (pending.length === 0) return
    setPrinting(true)
    try {
      await printTravelPDF(user?.name)
      refreshPending()
      toast.success('PDF downloaded! Future journeys will go to a new claim.')
    } catch (err) {
      toast.error(err?.message ?? 'Failed to generate sheet.')
    } finally {
      setPrinting(false)
    }
  }

  const totalPendingKm  = pending.reduce((sum, j) => sum + j.totalKm, 0)
  const totalPendingAmt = (totalPendingKm * RATE_PER_KM).toFixed(2)

  return (
    <div className="space-y-3">

      {/* ── Pending sheet summary + Print button ── */}
      {pending.length > 0 && (
        <div className="bg-surface-container-lowest shadow-ghost p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Current Sheet
            </p>
            <p className="text-sm font-bold text-on-surface mt-0.5">
              {pending.length} {pending.length === 1 ? 'journey' : 'journeys'} recorded
              &nbsp;·&nbsp;
              {totalPendingKm.toFixed(1)} km
              &nbsp;·&nbsp;
              ₹{Number(totalPendingAmt).toLocaleString()}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {pending.map((j, i) => (
                <span key={i} className="text-[11px] text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-sm">
                  {format(new Date(j.startTime), 'dd MMM')}
                  &nbsp;{format(new Date(j.startTime), 'HH:mm')}–{format(new Date(j.endTime), 'HH:mm')}
                  &nbsp;·&nbsp;{j.totalKm.toFixed(1)} km
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            {printing ? 'Generating…' : 'Print PDF'}
          </button>
        </div>
      )}

      {/* ── Completed journey — awaiting save ── */}
      {completed && (
        <div className="bg-surface-container-lowest shadow-ghost p-4 space-y-4 border-l-4 border-primary">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Journey Complete — Save to add to current sheet
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Date"      value={format(new Date(completed.startTime), 'dd MMM yyyy')} />
            <Stat label="Departure" value={format(new Date(completed.startTime), 'HH:mm')} />
            <Stat label="Arrival"   value={format(new Date(completed.endTime), 'HH:mm')} />
            <Stat label="Duration"  value={formatDuration(Math.floor((completed.endTime - completed.startTime) / 1000))} />
            <Stat label="Distance"  value={`${completed.totalKm.toFixed(2)} km`} highlight />
            <Stat label="Est. Amount" value={`₹${(completed.totalKm * RATE_PER_KM).toFixed(2)}`} />
          </div>
          <p className="text-xs text-on-surface-variant">
            Place of departure, arrival, and place of stay will be filled manually in the sheet.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Journey'}
            </button>
            <button
              type="button"
              onClick={() => setCompleted(null)}
              className="px-4 py-2 bg-surface-container-low text-on-surface-variant text-xs font-bold uppercase tracking-widest"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Active journey ── */}
      {active && !completed && (
        <div className="bg-surface-container-lowest shadow-ghost p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              Journey in Progress
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Started"  value={startTime ? format(new Date(startTime), 'HH:mm') : '--'} />
            <Stat label="Distance" value={`${totalKm.toFixed(2)} km`} highlight />
            <Stat label="Elapsed"  value={formatDuration(elapsed)} />
          </div>
          {gpsError && <p className="text-xs text-error font-semibold">{gpsError}</p>}
          <button
            type="button"
            onClick={handleStop}
            className="px-4 py-2 bg-error text-white text-xs font-bold uppercase tracking-widest"
          >
            End Journey
          </button>
        </div>
      )}

      {/* ── Idle — no active journey, no completed one ── */}
      {!active && !completed && (
        <div className="bg-surface-container-lowest shadow-ghost p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-bold text-on-surface">Start a Journey</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              GPS tracks your distance. Each journey is added to the current sheet until you print.
            </p>
            {gpsError && <p className="text-xs text-error font-semibold mt-1">{gpsError}</p>}
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            Start Journey
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TravelHistoryPage() {
  const user  = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useTravelHistory({ staffId: user?.id })
  const claims = useMemo(() => normalizeHistory(data), [data])

  return (
    <TravelShell
      title="My Travel"
      subtitle="Track journeys and manage reimbursement claims."
    >
      <JourneyTracker
        user={user}
        onJourneyAdded={() => queryClient.invalidateQueries({ queryKey: ['travel-history'] })}
      />

      {/* ── Claim History ── */}
      <div className="space-y-1 mt-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">
          Claim History
        </p>

        {isLoading && <TravelSkeleton rows={3} />}

        {!isLoading && isError && (
          <div className="bg-error/10 text-error px-4 py-3 text-sm font-semibold">
            Failed to load travel history.
          </div>
        )}

        {!isLoading && !isError && (
          <div className="space-y-3">
            {claims.length === 0 ? (
              <div className="bg-surface-container-lowest shadow-ghost px-4 py-8 text-center text-on-surface-variant text-sm">
                No travel claims yet. Start a journey above to create one.
              </div>
            ) : (
              claims.map((claim) => (
                <article
                  key={claim.id}
                  className="bg-surface-container-lowest shadow-ghost p-4 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-black font-headline text-on-surface">
                          {claim.description
                            ? claim.description.split('|')[0].trim()
                            : 'Travel Claim'}
                        </p>
                        {claim.description?.includes('|') && (
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            {claim.description.split('|').slice(1).join('|').trim()}
                          </p>
                        )}
                      </div>
                      <TravelStatusBadge status={claim.status} />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Date</p>
                        <p className="text-sm font-semibold text-on-surface">
                          {claim.date ? format(new Date(claim.date), 'dd MMM yyyy') : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Distance</p>
                        <p className="text-sm font-semibold text-on-surface">
                          {claim.distanceKm > 0 ? `${claim.distanceKm.toFixed(1)} km` : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Amount</p>
                        <p className="text-sm font-semibold text-on-surface">
                          ₹{claim.amountInr.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-container-low p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                      Status Timeline
                    </p>
                    <Timeline updates={claim.updates} />
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </TravelShell>
  )
}
