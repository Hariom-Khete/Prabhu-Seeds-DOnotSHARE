import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import apiClient from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'

const OTP_LENGTH = 6
const RESEND_SECONDS = 60

const ROLE_ROUTES = {
  owner: '/dashboard/owner',
  manager: '/dashboard/manager',
  field: '/dashboard/field',
  accounts: '/dashboard/accounts',
}

function maskMobile(mobile) {
  if (!mobile || mobile.length < 6) return mobile
  return `${mobile.slice(0, 2)}XXXXX${mobile.slice(-3)}`
}

export default function OTPVerifyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mobile = location.state?.mobile ?? ''

  // If someone lands here directly without going through login, send them back
  useEffect(() => {
    if (!mobile) navigate('/login', { replace: true })
  }, [mobile, navigate])

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''))
  const [countdown, setCountdown] = useState(RESEND_SECONDS)
  const inputRefs = useRef([])
  const setAuth = useAuthStore((s) => s.setAuth)

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown])

  const focusInput = (index) => inputRefs.current[index]?.focus()

  const handleChange = (e, index) => {
    const digit = e.target.value.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < OTP_LENGTH - 1) focusInput(index + 1)
  }

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const next = [...otp]
        next[index] = ''
        setOtp(next)
      } else if (index > 0) {
        focusInput(index - 1)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1)
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      focusInput(index + 1)
    }
  }

  // Handle pasting a full OTP string
  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    e.preventDefault()
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((ch, i) => (next[i] = ch))
    setOtp(next)
    focusInput(Math.min(pasted.length, OTP_LENGTH - 1))
  }

  async function handleResend() {
    try {
      await toast.promise(
        apiClient.post('/api/v1/auth/send-otp', { mobile: `+91${mobile}` }),
        {
          loading: 'Resending OTP…',
          success: 'OTP resent!',
          error: (err) => err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to resend OTP',
        }
      )
      setOtp(Array(OTP_LENGTH).fill(''))
      setCountdown(RESEND_SECONDS)
      focusInput(0)
    } catch {
      // error toast already shown
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== OTP_LENGTH) {
      toast.error('Please enter the complete 6-digit OTP')
      return
    }

    try {
      const { data } = await toast.promise(
        apiClient.post('/api/v1/auth/verify-otp', { mobile: `+91${mobile}`, otp: code }),
        {
          loading: 'Verifying…',
          success: 'Verified!',
          error: (err) => err.response?.data?.detail ?? err.response?.data?.message ?? 'Invalid OTP',
        }
      )
      setAuth(data.user, data.token)
      const route = ROLE_ROUTES[data.user?.role] ?? '/dashboard/field'
      navigate(route, { replace: true })
    } catch {
      // error toast already shown; clear OTP and refocus
      setOtp(Array(OTP_LENGTH).fill(''))
      focusInput(0)
    }
  }

  const formattedCountdown = `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md px-6 py-12">
        <div className="bg-surface-container-lowest shadow-ghost rounded-none border-l-4 border-primary p-8 relative">
          <Link
            to="/login"
            className="absolute top-8 left-8 text-on-surface-variant hover:text-primary transition-colors focus:outline-none"
            aria-label="Go back"
          >
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          </Link>

          <div className="flex flex-col items-center mt-8">
            <div className="mb-10 text-center">
              <h2 className="font-headline font-bold text-[18px] leading-tight text-on-surface tracking-tight mb-2">
                Verify OTP
              </h2>
              <p className="font-body text-sm text-on-surface-variant max-w-[280px] mx-auto">
                Enter the 6-digit code sent to{' '}
                <span className="font-semibold text-primary">+91</span>{' '}
                <span className="font-semibold text-on-surface">{maskMobile(mobile)}</span>
              </p>
            </div>

            <form onSubmit={handleVerify} noValidate className="w-full space-y-8">
              <div className="flex justify-between gap-2 max-w-xs mx-auto" onPaste={handlePaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputRefs.current[i] = el)}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(e, i)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    aria-label={`OTP digit ${i + 1}`}
                    className="w-12 h-12 text-center text-lg font-bold border border-outline-variant/60 rounded-sm focus:border-primary-container focus:ring-0 focus:border-2 transition-all bg-surface-container-low"
                    autoComplete="one-time-code"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <div className="text-center h-5">
                {countdown > 0 ? (
                  <p className="font-label text-[0.6875rem] uppercase tracking-blueprint text-on-surface-variant font-medium">
                    Resend OTP in <span className="text-primary font-bold">{formattedCountdown}</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="font-label text-[0.6875rem] uppercase tracking-blueprint text-primary font-bold hover:opacity-80"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={otp.join('').length !== OTP_LENGTH}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold py-4 px-6 rounded-sm transition-transform active:scale-95 shadow-ghost uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Verify
              </button>
            </form>

            <div className="mt-12 flex items-center justify-center space-x-2">
              <div className="h-px w-8 bg-outline-variant/15" />
              <span className="text-[10px] font-headline font-black text-primary/40 tracking-tight uppercase">PGA AgriTask</span>
              <div className="h-px w-8 bg-outline-variant/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
