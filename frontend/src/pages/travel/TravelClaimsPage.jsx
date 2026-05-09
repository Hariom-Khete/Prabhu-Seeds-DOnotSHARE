import { useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { format } from 'date-fns'
import generatePDF from 'react-to-pdf'
import TravelRouteMap from './components/TravelRouteMap'
import toast from 'react-hot-toast'
import { useTravelClaims, useApproveTravelClaim, useRejectTravelClaim } from './hooks/useTravel'
import { useAuthStore } from '@/store/authStore'
import TravelShell from './components/TravelShell'
import TravelStatusBadge from './components/TravelStatusBadge'
import TravelSkeleton from './components/TravelSkeleton'

function toIsoDate(date) {
  return format(date, 'yyyy-MM-dd')
}

function normalizeClaims(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload?.claims ?? payload?.items ?? payload?.data ?? [])
  if (!Array.isArray(rows)) return []

  return rows.map((row, idx) => ({
    id: row.id ?? row.claim_id ?? `travel-${idx}`,
    staffName: row.staff_name ?? row.staff?.name ?? row.name ?? 'Unknown',
    date: row.date ?? row.travel_date ?? row.created_at,
    distanceKm: Number(row.km ?? row.distance_km ?? row.distance ?? 0),
    ppkRate: Number(row.rate ?? row.ppk_rate ?? row.rate_per_km ?? 0),
    amountInr: Number(row.amount_inr ?? row.amount ?? 0),
    status: String(row.status ?? 'pending').toLowerCase(),
    department: row.department ?? row.staff?.department ?? '--',
  }))
}

function sumAmount(rows, status) {
  return rows.filter((r) => r.status === status).reduce((acc, row) => acc + row.amountInr, 0)
}

function formatMoney(value) {
  return `₹${Number(value ?? 0).toLocaleString()}`
}

export default function TravelClaimsPage() {
  const user = useAuthStore((s) => s.user)
  const role = user?.role?.toLowerCase()
  const canApprove = ['owner', 'manager', 'accounts'].includes(role)

  const [fromDate, setFromDate] = useState(toIsoDate(new Date(new Date().setDate(1))))
  const [toDate, setToDate] = useState(toIsoDate(new Date()))
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [mapClaim, setMapClaim] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  const approveMutation = useApproveTravelClaim()
  const rejectMutation = useRejectTravelClaim()

  const pdfRef = useRef(null)

  const { data, isLoading, isError } = useTravelClaims({
    fromDate,
    toDate,
    statusFilter: statusFilter !== 'all' ? statusFilter : undefined,
  })

  const rawClaims = useMemo(() => normalizeClaims(data), [data])
  // Status filtering is now done server-side; rawClaims is already filtered
  const claims = rawClaims

  const summary = {
    pendingInr: sumAmount(claims, 'pending'),
    approvedInr: sumAmount(claims, 'approved'),
    rejectedCount: claims.filter((r) => r.status === 'rejected').length,
    avgProcessingDays:
      data?.summary?.avg_processing_days ??
      data?.summary?.avgProcessingDays ??
      (claims.length ? (claims.length / Math.max(1, claims.filter((c) => c.status !== 'pending').length)).toFixed(1) : '0.0'),
  }

  const departments = useMemo(() => {
    const set = new Set(rawClaims.map((c) => c.department).filter(Boolean))
    return Array.from(set)
  }, [rawClaims])

  const pagination = data?.pagination ?? {
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((data?.total ?? claims.length) / pageSize)),
    total: data?.total ?? claims.length,
  }

  function handleCsvExport() {
    const header = ['Staff Name', 'Date', 'Distance (KM)', 'PPK Rate', 'Amount (INR)', 'Status']
    const lines = claims.map((claim) => [
      claim.staffName,
      claim.date ? format(new Date(claim.date), 'dd MMM yyyy') : '--',
      claim.distanceKm.toFixed(1),
      claim.ppkRate.toFixed(2),
      claim.amountInr.toFixed(2),
      claim.status,
    ])

    const csvContent = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `travel-claims-${fromDate}-to-${toDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handlePdfExport() {
    generatePDF(pdfRef, {
      filename: `travel-claims-${fromDate}-to-${toDate}.pdf`,
      method: 'save',
      page: { margin: 16, format: 'A4', orientation: 'landscape' },
    })
  }

  function openDecision(claimId, decision) {
    setConfirmAction({ claimId, decision })
  }

  async function applyDecision() {
    if (!confirmAction) return
    const { claimId, decision } = confirmAction
    setConfirmAction(null)
    const mutate = decision === 'approved' ? approveMutation : rejectMutation
    try {
      await mutate.mutateAsync(claimId)
      toast.success(`Claim ${decision}.`)
    } catch {
      toast.error('Could not update claim. Please try again.')
    }
  }

  const decisionPending = approveMutation.isPending || rejectMutation.isPending

  return (
    <TravelShell
      title="Travel Claims"
      subtitle="Review and manage field staff reimbursement requests."
      rightSlot={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCsvExport}
            className="px-3 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={handlePdfExport}
            className="px-3 py-2 bg-surface-container-low text-on-surface text-xs font-bold uppercase tracking-widest"
          >
            Export PDF
          </button>
        </div>
      }
    >
      {!canApprove && (
        <div className="bg-error/10 text-error px-4 py-3 text-sm font-semibold">
          You do not have permission to approve or reject travel claims.
        </div>
      )}

      <section className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex bg-surface-container-low p-1">
          {[
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'All', value: 'all' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest ${
                statusFilter === tab.value ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 text-xs font-bold uppercase tracking-widest"
            aria-label="Department filter"
          >
            <option value="">All Departments</option>
            {departments.map((dep) => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setPage(1)
            }}
            className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 text-xs font-bold"
            aria-label="From date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
              setPage(1)
            }}
            className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 text-xs font-bold"
            aria-label="To date"
          />
        </div>
      </section>

      {(isLoading || !data) && <TravelSkeleton rows={5} />}

      {!isLoading && data && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" ref={pdfRef}>
            <article className="bg-surface-container-lowest shadow-ghost px-5 py-4 relative">
              <span className="absolute left-0 top-0 h-full w-1 bg-primary" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total Pending INR</p>
              <p className="text-4xl font-black font-headline mt-1">{formatMoney(summary.pendingInr)}</p>
            </article>

            <article className="bg-surface-container-lowest shadow-ghost px-5 py-4 relative">
              <span className="absolute left-0 top-0 h-full w-1 bg-secondary" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Approved INR</p>
              <p className="text-4xl font-black font-headline mt-1">{formatMoney(summary.approvedInr)}</p>
            </article>

            <article className="bg-surface-container-lowest shadow-ghost px-5 py-4 relative">
              <span className="absolute left-0 top-0 h-full w-1 bg-error" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Rejected Count</p>
              <p className="text-4xl font-black font-headline mt-1">{summary.rejectedCount}</p>
            </article>

            <article className="bg-surface-container-lowest shadow-ghost px-5 py-4 relative">
              <span className="absolute left-0 top-0 h-full w-1 bg-tertiary" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Avg Processing</p>
              <p className="text-4xl font-black font-headline mt-1">{summary.avgProcessingDays} days</p>
            </article>
          </section>

          {isError && (
            <div className="bg-error/10 text-error px-4 py-3 text-sm font-semibold">
              Failed to load travel claims.
            </div>
          )}

          {!isError && (
            <section className="bg-surface-container-lowest shadow-ghost overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-surface-container-high border-b border-outline-variant/20">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Staff Name</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Date</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Distance</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">PPK Rate</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Amount (INR)</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">GPS Route</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {claims.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-on-surface-variant">
                        No travel claims found.
                      </td>
                    </tr>
                  ) : (
                    claims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-surface-container-low/50">
                        <td className="px-4 py-3 text-sm font-semibold text-on-surface">{claim.staffName}</td>
                        <td className="px-4 py-3 text-sm text-on-surface-variant">
                          {claim.date ? format(new Date(claim.date), 'dd MMM yyyy') : '--'}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-on-surface-variant">{claim.distanceKm.toFixed(1)} km</td>
                        <td className="px-4 py-3 text-sm font-mono text-on-surface-variant">₹{claim.ppkRate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-on-surface">₹{claim.amountInr.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setMapClaim(claim)}
                            className="text-xs font-bold uppercase tracking-widest text-primary hover:underline"
                          >
                            View Route
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <TravelStatusBadge status={claim.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openDecision(claim.id, 'approved')}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-primary text-on-primary disabled:opacity-50"
                              disabled={claim.status === 'approved' || decisionPending}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => openDecision(claim.id, 'rejected')}
                              className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest bg-error text-white disabled:opacity-50"
                              disabled={claim.status === 'rejected' || decisionPending}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/20">
                <p className="text-xs text-on-surface-variant">
                  Page {pagination.page} of {pagination.totalPages} · {pagination.total} claims
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest bg-surface-container-low text-on-surface-variant disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest bg-surface-container-low text-on-surface-variant disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          )}

          <Dialog.Root open={!!mapClaim} onOpenChange={(open) => !open && setMapClaim(null)}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/35 z-40" />
              <Dialog.Content
                className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-4xl bg-surface-container-lowest shadow-ghost p-5"
                aria-describedby={undefined}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Dialog.Title className="text-lg font-black font-headline text-on-surface">GPS Journey Route</Dialog.Title>
                    {mapClaim && (
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {mapClaim.staffName} · {mapClaim.date ? format(new Date(mapClaim.date), 'dd MMM yyyy') : ''}
                      </p>
                    )}
                  </div>
                  <Dialog.Close className="text-on-surface-variant hover:text-on-surface text-2xl leading-none" aria-label="Close">&times;</Dialog.Close>
                </div>
                {mapClaim && <TravelRouteMap expenseId={mapClaim.id} heightClass="h-[460px]" />}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <AlertDialog.Root open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 bg-black/35 z-50" />
              <AlertDialog.Content className="fixed z-[60] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-surface-container-lowest shadow-ghost p-5 space-y-4">
                <AlertDialog.Title className="text-xl font-black font-headline text-on-surface">Confirm Action</AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-on-surface-variant">
                  {confirmAction?.decision === 'approved'
                    ? 'Approve this travel claim?'
                    : 'Reject this travel claim?'}
                </AlertDialog.Description>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Cancel className="px-3 py-2 bg-surface-container-low text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Cancel
                  </AlertDialog.Cancel>
                  <AlertDialog.Action
                    onClick={applyDecision}
                    className={`px-3 py-2 text-xs font-bold uppercase tracking-widest ${
                      confirmAction?.decision === 'approved' ? 'bg-primary text-on-primary' : 'bg-error text-white'
                    }`}
                  >
                    Confirm
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </>
      )}
    </TravelShell>
  )
}
