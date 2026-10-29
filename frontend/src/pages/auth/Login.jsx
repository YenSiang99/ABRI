import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { resendVerification } from "@/lib/api/auth";

// text-base (not text-sm) below md: inputs under 16px make iOS Safari
// auto-zoom on focus, and the zoom tends to stick around after navigating
// away in an SPA.
const fieldClass =
  "w-full rounded-sm border border-grey-300 px-3.5 py-2.5 text-base md:text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow";
const labelClass = "text-[13px] font-bold text-ink dark:text-foreground";

// Where to land after a successful login. `from` is the page ProtectedRoute
// was guarding when it bounced to /login — but it belongs to whoever was
// there LAST, which is not necessarily whoever just logged in. Signing out of
// /app/admin and logging back in as a member used to restore /app/admin for
// them: AdminReview mounted, fired GET /admin/claims before its own !isAdmin
// guard could redirect, and greeted the member with an "Admin access
// required." toast. So `from` is honoured only where this account may
// actually go, and admins always land in their own subtree (AppLayout
// confines them there anyway).
function destinationAfterLogin(from, isAdmin) {
  if (isAdmin) return "/app/admin";
  if (!from || from.startsWith("/app/admin")) return "/app";
  return from;
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set when login was refused only because the email was never confirmed.
  const [unverified, setUnverified] = useState(false);
  const [resend, setResend] = useState({ status: "idle", message: "" });

  async function handleResend() {
    setResend({ status: "sending", message: "" });
    try {
      await resendVerification({ email: email.trim(), password });
      setResend({ status: "sent", message: `Sent. Check ${email.trim()} for a new link.` });
    } catch (err) {
      setResend({ status: "error", message: err.message });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError("");
    setUnverified(false);
    setResend({ status: "idle", message: "" });
    setSubmitting(true);
    const result = await login(email.trim(), password);
    if (!result.ok) {
      setError(result.error);
      setUnverified(result.requiresEmailVerification);
      setSubmitting(false);
      return;
    }
    // Deliberately leaves `submitting` set: the navigate below unmounts this
    // form, and clearing it first flashes the idle button for a frame.
    navigate(destinationAfterLogin(location.state?.from?.pathname, result.isAdmin), {
      replace: true,
    });
  }

  return (
    <div className="mx-auto max-w-[420px] px-6 py-24">
      <div className="rounded-lg border border-grey-200 bg-white p-8 dark:border-border dark:bg-card">
        <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
          Member login
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
          Log in to manage your verified profile, endorsements, and network.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={cn(fieldClass, "mt-1.5")}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className={labelClass}>Password</label>
              <Link
                to="/forgot-password"
                className="text-[12.5px] font-bold text-grey-600 hover:underline dark:text-muted-foreground"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={cn(fieldClass, "mt-1.5")}
              disabled={submitting}
            />
          </div>

          {error && <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}

          {unverified && (
            <div className="rounded-sm border border-grey-200 bg-grey-50 p-3 text-[13px] dark:border-border dark:bg-muted/40">
              {resend.status === "sent" ? (
                <p className="text-ink dark:text-foreground">{resend.message}</p>
              ) : (
                <>
                  <p className="text-grey-600 dark:text-muted-foreground">
                    Lost the email, or the link expired?
                  </p>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resend.status === "sending"}
                    className="mt-2 inline-flex items-center gap-2 font-bold text-ink hover:underline disabled:opacity-60 dark:text-foreground"
                  >
                    {resend.status === "sending" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    Send a new confirmation link
                  </button>
                  {resend.status === "error" && (
                    <p className="mt-1 text-[12.5px] text-red-600 dark:text-red-400">{resend.message}</p>
                  )}
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13.5px] text-grey-500 dark:text-muted-foreground">
          Not verified yet?{" "}
          <Link to="/register" className="font-bold text-ink hover:underline dark:text-foreground">
            Claim your business
          </Link>
        </p>
      </div>
    </div>
  );
}

export { Login };
