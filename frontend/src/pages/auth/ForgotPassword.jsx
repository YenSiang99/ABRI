import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { forgotPassword } from "@/lib/api/auth";

// Same sizing rule as Login.jsx: under 16px, iOS Safari zooms on focus.
const fieldClass =
  "w-full rounded-sm border border-grey-300 px-3.5 py-2.5 text-base md:text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow";
const labelClass = "text-[13px] font-bold text-ink dark:text-foreground";

// Asks for a reset link. The answer reads the same whether or not the email
// has an account (see POST /auth/forgot-password), so this page never says
// which.
function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (!email.trim()) {
      setError("Enter your email to continue.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await forgotPassword(email.trim());
      setSent(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
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
          Reset your password
        </h1>

        {sent ? (
          <p className="mt-4 text-[14px] text-grey-600 dark:text-muted-foreground">
            {sent} The link works for one hour.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
              Enter the email you signed up with and we&rsquo;ll send you a link to choose a new
              password. It also confirms your email if you never did.
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

              {error && <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
              >
                {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-[13.5px] text-grey-500 dark:text-muted-foreground">
          <Link to="/login" className="font-bold text-ink hover:underline dark:text-foreground">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export { ForgotPassword };
