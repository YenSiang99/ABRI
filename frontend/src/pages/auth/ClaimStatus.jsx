import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Standing in for a real claim-status lookup, which needs a backend
// endpoint this pass doesn't add (see routes/admin.js — GET /claims is
// admin-only). Until that exists, claimants just wait for the emailed
// confirmation link rather than checking back here.
function ClaimStatus() {
  return (
    <div className="mx-auto max-w-[520px] px-6 py-16">
      <Link
        to="/directory"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to directory
      </Link>

      <div className="mt-6 rounded-lg border border-grey-200 bg-white p-8 dark:border-border dark:bg-card">
        <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
          Claim your business
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
          Your claim is being reviewed
        </h1>
        <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
          We'll email you a confirmation link once an admin has reviewed your claim — there's
          no status to check back here in the meantime. If your business's email domain
          matched, you'd have gotten that link immediately after submitting instead.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}

export { ClaimStatus };
