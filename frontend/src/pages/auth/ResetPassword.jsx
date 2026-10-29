import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { resetPassword } from "@/lib/api/auth";
import { useAuth } from "@/context/AuthContext";

// Same sizing rule as Login.jsx: under 16px, iOS Safari zooms on focus.
const fieldClass =
  "w-full rounded-sm border border-grey-300 px-3.5 py-2.5 text-base md:text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow";
const labelClass = "text-[13px] font-bold text-ink dark:text-foreground";

// Landing point for the link from POST /auth/forgot-password. A successful
// reset starts a session (and confirms the email), so it goes straight into
// the app.
function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refreshAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await resetPassword(token, password);
      // The backend set the session cookie; AuthContext needs to hear about it.
      await refreshAccount();
      navigate(data.account?.isAdmin ? "/app/admin" : "/app", { replace: true });
    } catch (err) {
      setError(err.message);
      setExpired(Boolean(err.expired) || err.status === 404);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[420px] px-6 py-24">
      <div className="rounded-lg border border-grey-200 bg-white p-8 dark:border-border dark:bg-card">
        <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
          Member login
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
          Choose a new password
        </h1>

        {expired ? (
          <>
            <p className="mt-4 text-[14px] text-grey-600 dark:text-muted-foreground">{error}</p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-block text-sm font-bold text-ink hover:underline dark:text-foreground"
            >
              Send a new reset link
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label className={labelClass}>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className={cn(fieldClass, "mt-1.5")}
                disabled={submitting}
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className={cn(fieldClass, "mt-1.5")}
                disabled={submitting}
              />
            </div>

            {error && <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {submitting ? "Saving…" : "Save and log in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export { ResetPassword };
