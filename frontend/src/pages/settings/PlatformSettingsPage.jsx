import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Dialog from '@radix-ui/react-dialog'
import toast from 'react-hot-toast'
import DashboardShell, { DashboardTopbar } from '@/components/layout/DashboardShell'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/lib/axios'

// ── API helpers ────────────────────────────────────────────────────────────

function useUsers() {
  return useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => apiClient.get('/api/v1/users').then((r) => r.data),
    staleTime: 60_000,
  })
}

function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) => apiClient.post('/api/v1/users', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

// ── Add Member dialog ──────────────────────────────────────────────────────

const schema = z.object({
  name:     z.string().min(1, 'First name is required'),
  surname:  z.string().min(1, 'Surname is required'),
  mobile:   z.string().min(10, 'Enter a valid mobile number'),
  email:    z.string().email('Enter a valid email').or(z.literal('')).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role:     z.enum(['MANAGER', 'FIELD'], { required_error: 'Select a role' }),
})

function AddMemberDialog({ open, onOpenChange }) {
  const createUser = useCreateUser()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { role: 'FIELD' } })

  async function onSubmit(values) {
    try {
      await createUser.mutateAsync({
        name:     values.name,
        surname:  values.surname,
        mobile:   values.mobile,
        email:    values.email || null,
        password: values.password,
        role:     values.role,
      })
      toast.success(`${values.name} ${values.surname} added successfully`)
      reset()
      onOpenChange(false)
    } catch (err) {
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Failed to add member')
    }
  }

  function handleClose(open) {
    if (!open) reset()
    onOpenChange(open)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2
            bg-surface-container-lowest shadow-2xl p-6
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-xl font-black font-headline text-on-surface tracking-tight">
              Add New Member
            </Dialog.Title>
            <Dialog.Close className="text-on-surface-variant hover:text-on-surface text-xl leading-none" aria-label="Close">
              &times;
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                  First Name <span className="text-error">*</span>
                </label>
                <input
                  {...register('name')}
                  placeholder="Arjun"
                  className="w-full bg-surface-container-low border-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                />
                {errors.name && <p className="text-[10px] text-error mt-0.5">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                  Surname <span className="text-error">*</span>
                </label>
                <input
                  {...register('surname')}
                  placeholder="Deshmukh"
                  className="w-full bg-surface-container-low border-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                />
                {errors.surname && <p className="text-[10px] text-error mt-0.5">{errors.surname.message}</p>}
              </div>
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                Mobile Number <span className="text-error">*</span>
              </label>
              <input
                {...register('mobile')}
                placeholder="+91 98200 12345"
                className="w-full bg-surface-container-low border-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
              {errors.mobile && <p className="text-[10px] text-error mt-0.5">{errors.mobile.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                Email Address
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="arjun@prabhuseeds.com"
                className="w-full bg-surface-container-low border-none px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
              {errors.email && <p className="text-[10px] text-error mt-0.5">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                Password <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  className="w-full bg-surface-container-low border-none px-3 py-2 pr-10 text-sm focus:ring-1 focus:ring-primary outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {errors.password && <p className="text-[10px] text-error mt-0.5">{errors.password.message}</p>}
            </div>

            {/* Role */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                Role <span className="text-error">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'MANAGER', label: 'Manager', icon: 'manage_accounts' },
                  { value: 'FIELD',   label: 'Field Staff', icon: 'agriculture' },
                ].map(({ value, label, icon }) => (
                  <label
                    key={value}
                    className="relative flex items-center gap-2 bg-surface-container-low px-3 py-2.5 cursor-pointer has-[:checked]:bg-primary/10 has-[:checked]:ring-1 has-[:checked]:ring-primary"
                  >
                    <input type="radio" value={value} {...register('role')} className="sr-only" />
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{icon}</span>
                    <span className="text-sm font-semibold text-on-surface">{label}</span>
                  </label>
                ))}
              </div>
              {errors.role && <p className="text-[10px] text-error mt-0.5">{errors.role.message}</p>}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 py-2.5 border border-outline-variant/30 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting || createUser.isPending}
                className="flex-1 py-2.5 bg-primary text-on-primary text-sm font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {createUser.isPending ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Role badge ─────────────────────────────────────────────────────────────

const ROLE_META = {
  OWNER:    { label: 'Owner',      cls: 'bg-tertiary/15 text-tertiary' },
  MANAGER:  { label: 'Manager',    cls: 'bg-primary/10 text-primary' },
  FIELD:    { label: 'Field Staff', cls: 'bg-green-600/10 text-green-700' },
  ACCOUNTS: { label: 'Accounts',   cls: 'bg-amber-500/15 text-amber-700' },
}

function RoleBadge({ role }) {
  const meta = ROLE_META[(role ?? '').toUpperCase()] ?? { label: role, cls: 'bg-surface-container text-on-surface-variant' }
  return (
    <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PlatformSettingsPage() {
  const user = useAuthStore((s) => s.user)
  const isOwner = (user?.role ?? '').toLowerCase() === 'owner'
  const [addOpen, setAddOpen] = useState(false)

  const initials = useMemo(() =>
    String(user?.name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('')
  , [user?.name])

  const { data: members = [], isLoading: membersLoading } = useUsers()

  return (
    <DashboardShell
      brandTitle="Prabhu Seeds"
      brandSubtitle="Agritask Platform"
      topbar={
        <DashboardTopbar
          left={null}
          right={
            <span className="h-7 w-7 rounded-sm bg-primary-container text-on-primary text-[11px] font-bold inline-flex items-center justify-center">
              {initials || '?'}
            </span>
          }
        />
      }
    >
      <div className="max-w-6xl mx-auto space-y-4">
        <section>
          <h1 className="text-4xl font-black font-headline text-on-surface">System Settings</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Manage your platform profile, preferences, and organisation access.
          </p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
          {/* ── Left column ── */}
          <div className="space-y-3">
            {/* Profile card */}
            <article className="bg-surface-container-lowest border-l-4 border-primary p-4">
              <div className="flex flex-col items-center text-center">
                <span className="h-16 w-16 rounded-sm bg-surface-container-high text-on-surface text-xl font-black inline-flex items-center justify-center">
                  {initials || '?'}
                </span>
                <h2 className="text-2xl font-black font-headline mt-3">{user?.name ?? '—'}</h2>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary mt-1">
                  {user?.role ?? '—'}
                </p>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant">Mobile</dt>
                  <dd className="font-semibold text-right">{user?.mobile ?? '—'}</dd>
                </div>
                {user?.state && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">State</dt>
                    <dd className="font-semibold text-right">{user.state}</dd>
                  </div>
                )}
              </dl>
            </article>

            {/* System status */}
            <article className="bg-surface-container-lowest p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black uppercase tracking-[0.14em]">System Status</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Operational
                </span>
              </div>
            </article>

            {/* About */}
            <article className="bg-surface-container-lowest p-4">
              <h3 className="text-xl font-black font-headline">About Platform</h3>
              <p className="text-sm text-on-surface-variant mt-2">PGA AgriTask v2.4.1</p>
              <div className="mt-4 space-y-2 text-sm text-on-surface">
                <button type="button" className="block hover:text-primary">Privacy Policy</button>
                <button type="button" className="block hover:text-primary">Terms of Service</button>
              </div>
            </article>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-3">
            {/* User directory */}
            <article className="bg-surface-container-lowest p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h3 className="text-2xl font-black font-headline">User Directory</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {isOwner ? 'Owner-only: create and manage members.' : 'Organisation members.'}
                  </p>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="h-8 px-3 bg-primary text-on-primary text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 hover:opacity-90"
                  >
                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">person_add</span>
                    Add Member
                  </button>
                )}
              </div>

              {membersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-surface-container-low animate-pulse" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[560px] w-full text-sm">
                    <thead>
                      <tr className="bg-surface-container-low text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">
                        <th className="px-3 py-3 text-left">Member</th>
                        <th className="px-3 py-3 text-left">Role</th>
                        <th className="px-3 py-3 text-left">Mobile</th>
                        <th className="px-3 py-3 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-sm text-on-surface-variant">
                            No members yet.
                          </td>
                        </tr>
                      ) : (
                        members.map((m) => {
                          const fullName = [m.name, m.surname].filter(Boolean).join(' ')
                          const avatarLetters = fullName
                            .split(' ')
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()
                          return (
                            <tr key={m.id} className="border-t border-outline-variant/15 hover:bg-surface-container-low/40">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="h-7 w-7 bg-primary/10 text-primary text-[10px] font-bold inline-flex items-center justify-center flex-shrink-0">
                                    {avatarLetters}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-semibold truncate">{fullName}</p>
                                    {m.email && (
                                      <p className="text-[10px] text-on-surface-variant truncate">{m.email}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <RoleBadge role={m.role} />
                              </td>
                              <td className="px-3 py-3 text-on-surface-variant font-mono text-xs">
                                {m.mobile}
                              </td>
                              <td className="px-3 py-3">
                                <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${m.is_active ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
                                  {m.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        </section>
      </div>

      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
    </DashboardShell>
  )
}
