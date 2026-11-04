import { FormEvent, ReactNode, useEffect, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { formatDomainList, isEmailAllowed } from "@/lib/email-domains"
import { YEAR_OPTIONS, type ProfileDetails } from "@/types/user"

type AuthLink = "/sign-in" | "/register" | "/forgot-password"
type GoTo = (route: AuthLink) => void

const MIN_PASSWORD_LENGTH = 8

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function AuthCard({ children, labelledBy, className = "" }: { children: ReactNode; labelledBy: string; className?: string }) {
  return (
    <main className="auth-page">
      <section className={`auth-card ${className}`.trim()} aria-labelledby={labelledBy}>
        <a className="auth-brand" href="/" aria-label="Barterman home"><span className="auth-brand-mark">b</span>Barterman</a>
        {children}
      </section>
    </main>
  )
}

function DomainNote({ domains }: { domains: string[] }) {
  return (
    <p className="auth-footnote">
      {domains.length
        ? `Barterman is open to students with ${formatDomainList(domains)} email addresses.`
        : "Use your college email so classmates know who they're trading with."}
    </p>
  )
}

export function AuthLoading() {
  return (
    <main className="auth-page">
      <div className="auth-loading" role="status"><span className="auth-spinner" aria-hidden="true" />Loading your account…</div>
    </main>
  )
}

export function SignIn({ go }: { go: GoTo }) {
  const { signInWithGoogle, signInWithEmail, authError, clearAuthError, allowedEmailDomains, isConfigured } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState<"google" | "email" | null>(null)
  const [error, setError] = useState("")
  const busy = pending !== null || !isConfigured

  const run = async (kind: "google" | "email", action: () => Promise<void>) => {
    setError("")
    clearAuthError()
    setPending(kind)
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause, "Sign-in didn't complete. Please try again."))
    } finally {
      setPending(null)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run("email", () => signInWithEmail(email, password))
  }

  const shownError = error || authError

  return (
    <AuthCard labelledBy="signin-heading">
      <div className="auth-copy">
        <span className="auth-eyebrow">Your campus, connected</span>
        <h1 id="signin-heading">Welcome to Barterman</h1>
        <p>Find your people. Trade what you love. Sign in with your college account.</p>
      </div>
      <button className="google-signin-button" type="button" onClick={() => void run("google", signInWithGoogle)} disabled={busy}>
        {pending === "google" ? <span className="auth-spinner" aria-hidden="true" /> : <GoogleMark />}
        {pending === "google" ? "Connecting to Google…" : "Continue with Google"}
      </button>
      <div className="auth-divider"><span>or</span></div>
      <form className="auth-form" onSubmit={submit}>
        <label>College email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@college.edu" /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="auth-primary-button" type="submit" disabled={busy}>{pending === "email" ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="auth-link-row">
        <button type="button" className="auth-text-button" onClick={() => go("/forgot-password")}>Forgot password?</button>
        <button type="button" className="auth-text-button" onClick={() => go("/register")}>Create an account</button>
      </div>
      {shownError && <p className="auth-error" role="alert">{shownError}</p>}
      <DomainNote domains={allowedEmailDomains} />
    </AuthCard>
  )
}

export function Register({ go }: { go: GoTo }) {
  const { registerWithEmail, allowedEmailDomains, isConfigured, authError } = useAuth()
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (!form.name.trim()) return setError("Enter your full name.")
    if (!isEmailAllowed(form.email, allowedEmailDomains)) return setError(`Use your college email address (${formatDomainList(allowedEmailDomains)}).`)
    if (form.password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`)
    if (form.password !== form.confirm) return setError("The passwords don't match.")
    setPending(true)
    try {
      await registerWithEmail({ name: form.name, email: form.email, password: form.password })
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't create your account. Please try again."))
    } finally {
      setPending(false)
    }
  }

  const shownError = error || (!isConfigured ? authError : "")

  return (
    <AuthCard labelledBy="register-heading">
      <div className="auth-copy">
        <span className="auth-eyebrow">Join your campus</span>
        <h1 id="register-heading">Create your account</h1>
        <p>We'll send a link to your college email to confirm it's you.</p>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label>Full name<input autoComplete="name" required value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
        <label>College email<input type="email" autoComplete="email" required value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="you@college.edu" /></label>
        <label>Password<input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={form.password} onChange={(event) => update("password", event.target.value)} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" required value={form.confirm} onChange={(event) => update("confirm", event.target.value)} /></label>
        <button className="auth-primary-button" type="submit" disabled={pending || !isConfigured}>{pending ? "Creating account…" : "Create account"}</button>
      </form>
      <div className="auth-link-row">
        <span className="auth-muted-inline">Already have an account?</span>
        <button type="button" className="auth-text-button" onClick={() => go("/sign-in")}>Sign in</button>
      </div>
      {shownError && <p className="auth-error" role="alert">{shownError}</p>}
      <DomainNote domains={allowedEmailDomains} />
    </AuthCard>
  )
}

export function ForgotPassword({ go }: { go: GoTo }) {
  const { sendPasswordReset, isConfigured } = useAuth()
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState("")
  const [error, setError] = useState("")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setPending(true)
    try {
      await sendPasswordReset(email)
      setSentTo(email.trim())
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't send the reset email. Please try again."))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard labelledBy="reset-heading" className="auth-card-narrow">
      <div className="auth-copy">
        <span className="auth-eyebrow">Account help</span>
        <h1 id="reset-heading">Reset your password</h1>
        <p>Enter your college email and we'll send you a link to choose a new password.</p>
      </div>
      {sentTo ? (
        <p className="auth-success" role="status">If an account exists for {sentTo}, a reset link is on its way. Check your inbox and spam folder.</p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>College email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <button className="auth-primary-button" type="submit" disabled={pending || !isConfigured}>{pending ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-link-row">
        <button type="button" className="auth-text-button" onClick={() => go("/sign-in")}>← Back to sign in</button>
      </div>
    </AuthCard>
  )
}

const RESEND_COOLDOWN_MS = 30_000

export function VerifyEmail() {
  const { firebaseUser, resendVerificationEmail, confirmEmailVerified, signOut } = useAuth()
  const [pending, setPending] = useState<"check" | "resend" | null>(null)
  const [canResend, setCanResend] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (canResend) return
    const timer = window.setTimeout(() => setCanResend(true), RESEND_COOLDOWN_MS)
    return () => window.clearTimeout(timer)
  }, [canResend])

  const check = async () => {
    setError("")
    setMessage("")
    setPending("check")
    try {
      const verified = await confirmEmailVerified()
      if (!verified) setError("We haven't seen the verification yet. Open the link in the email, then try again.")
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't check your verification. Please try again."))
    } finally {
      setPending(null)
    }
  }

  const resend = async () => {
    setError("")
    setMessage("")
    setPending("resend")
    try {
      await resendVerificationEmail()
      setMessage("A new verification email is on its way.")
      setCanResend(false)
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't resend the email. Please try again."))
    } finally {
      setPending(null)
    }
  }

  return (
    <AuthCard labelledBy="verify-heading" className="auth-card-narrow">
      <div className="auth-copy">
        <span className="auth-eyebrow">One quick check</span>
        <h1 id="verify-heading">Verify your email</h1>
        <p>We sent a verification link to <strong>{firebaseUser?.email ?? "your email"}</strong>. Open it, then come back here.</p>
      </div>
      <div className="auth-actions">
        <button className="auth-primary-button" type="button" onClick={() => void check()} disabled={pending !== null}>{pending === "check" ? "Checking…" : "I've verified my email"}</button>
        <button className="auth-secondary-button" type="button" onClick={() => void resend()} disabled={pending !== null || !canResend}>{pending === "resend" ? "Sending…" : canResend ? "Resend email" : "Resend email (available shortly)"}</button>
      </div>
      {message && <p className="auth-success" role="status">{message}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-link-row">
        <button type="button" className="auth-text-button" onClick={() => void signOut()}>Use a different account</button>
      </div>
    </AuthCard>
  )
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 5)"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.02 46.98 31.8 46.98 24.55Z" transform="translate(0 0)"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" transform="translate(0 0)"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -5)"/></svg>
}

export function CompleteProfile({ onSaved }: { onSaved: () => void }) {
  const { user, saveProfile, signOut } = useAuth()
  const [details, setDetails] = useState<ProfileDetails>(() => ({
    college: user?.college ?? "",
    course: user?.course ?? "",
    year: user?.year ?? "",
    phone: user?.phone ?? "",
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  if (!user) return <AuthLoading />

  const update = (key: keyof ProfileDetails, value: string) => setDetails((current) => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setSaving(true)
    try {
      await saveProfile(details)
      onSaved()
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't save your profile. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="auth-page auth-page-profile">
      <section className="auth-card profile-card" aria-labelledby="profile-heading">
        <a className="auth-brand" href="/" aria-label="Barterman home"><span className="auth-brand-mark">b</span>Barterman</a>
        <div className="profile-welcome">
          {user.avatarUrl ? <img className="profile-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</div>}
          <span className="auth-eyebrow">One last step</span>
          <h1 id="profile-heading">Complete your profile</h1>
          <p>Make it easy for your campus community to know you.</p>
        </div>
        <form className="profile-form" onSubmit={submit}>
          <label>Full name<input value={user.name} readOnly /></label>
          <label>Email address<input value={user.email} readOnly type="email" /></label>
          <label>College / University<input required autoComplete="organization" placeholder="e.g. PES University" value={details.college} onChange={(event) => update("college", event.target.value)} /></label>
          <label>Course / Department<input required placeholder="e.g. Computer Science" value={details.course} onChange={(event) => update("course", event.target.value)} /></label>
          <label>Year of study<select required value={details.year} onChange={(event) => update("year", event.target.value)}><option value="" disabled>Select your year</option>{YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}</select></label>
          <label>Phone number <span className="optional-label">Optional</span><input type="tel" autoComplete="tel" placeholder="Add a contact number" value={details.phone} onChange={(event) => update("phone", event.target.value)} /></label>
          {error && <p className="auth-error profile-form-error" role="alert">{error}</p>}
          <button className="auth-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : <>Continue <span aria-hidden="true">→</span></>}</button>
        </form>
        <p className="auth-footnote profile-private-note">Your details are saved to your Barterman account.</p>
        <div className="auth-link-row auth-link-row-center">
          <button type="button" className="auth-text-button" onClick={() => void signOut()}>Not you? Sign out</button>
        </div>
      </section>
    </main>
  )
}

export function OnboardingNext({ onContinue }: { onContinue: () => void }) {
  const { user } = useAuth()
  return (
    <AuthCard labelledBy="onboarding-heading" className="auth-card-narrow onboarding-next-card">
      <div className="onboarding-check" aria-hidden="true">✓</div>
      <span className="auth-eyebrow">Profile saved</span>
      <h1 id="onboarding-heading">You're on your way, {user?.name.split(" ")[0] || "there"}.</h1>
      <p className="auth-muted">Your profile is saved. Start exploring what students at {user?.college || "your campus"} are sharing.</p>
      <div className="auth-actions">
        <button className="auth-primary-button" type="button" onClick={onContinue}>Start exploring <span aria-hidden="true">→</span></button>
      </div>
    </AuthCard>
  )
}
