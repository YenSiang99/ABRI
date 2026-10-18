import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Clock, MapPin, Search, XCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { fetchBusiness, sendClaimCode, verifyClaimCode } from "@/lib/api/businesses";
import { CodeClaim } from "@/components/app/CodeClaim";
import { UNCLAIMED } from "@/lib/verificationLevels";
import { SearchStep, DetailsStep, EMPTY_FORM } from "@/pages/auth/Register";

// Home for an account with no approved business: a claimant waiting on the
// admin, one whose claim was rejected, or a signup that never claimed.
// AppLayout renders this at /app in place of the Dashboard, and confines
// these accounts to it, the directory and business profiles — the server
// already treats them as having no business (middleware/auth.js), so every
// other page would only show errors.
//
// The point of the screen is that signing up is never a dead end: there is
// always a status to read and a next thing to do.
function ClaimHome() {
  const { claim, account } = useAuth();
  const status = claim?.status ?? "none";
  // A pending claimant can still move their claim to another listing, but
  // the form stays closed until they ask — the default for them is to wait.
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("business");
  const [asked, setClaiming] = useState(false);
  const claiming = status !== "pending" || Boolean(preselectedId) || asked;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Welcome{account?.name ? `, ${account.name.split(" ")[0]}` : ""}
      </div>

      {status === "pending" && <PendingClaim claim={claim} />}
      {status === "rejected" && (
        <>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Your claim wasn't approved
          </h1>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <XCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
            An admin couldn't match your claim to the business — usually because the SSM
            registration number didn't check out, or someone else proved ownership first. Your
            account is still yours: claim again below with your SSM number.
          </p>
        </>
      )}
      {status === "none" && (
        <>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Claim your business
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Find your listing, or add your business if it isn't listed yet. An admin checks it
            against your SSM registration.
          </p>
        </>
      )}

      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Search className="h-4 w-4" aria-hidden /> While you're here
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          The whole directory is open to you — every listing, with its phone and email where
          we have them.
        </p>
        <Link to="/app/directory" className={cn(buttonVariants({ variant: "outline" }), "mt-4 px-3 py-2")}>
          Browse the directory
        </Link>
      </div>

      <div className="mt-8">
        {claiming ? (
          <ClaimForm preselectedId={preselectedId} moving={status === "pending"} />
        ) : (
          <button
            type="button"
            onClick={() => setClaiming(true)}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Claimed the wrong listing? Claim a different one
          </button>
        )}
      </div>
    </div>
  );
}

function PendingClaim({ claim }) {
  const listing = claim.business;
  return (
    <>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Your claim is with an admin
      </h1>
      <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
        <Clock className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
        An ABRI admin checks your claim against your SSM registration. This usually takes 1–3
        business days, and we'll email you when it's decided.
      </p>
      {listing && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
            {listing.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{listing.name}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" aria-hidden /> {listing.category}
              </span>
              {listing.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> {listing.location}
                </span>
              )}
            </div>
          </div>
          <span className="ml-auto rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Pending
          </span>
        </div>
      )}
      {claim.codeEmail && <PendingCodeClaim codeEmail={claim.codeEmail} />}
    </>
  );
}

// Owning the business once the code is right: AppLayout swaps this screen
// for the app as soon as the account is refreshed.
function PendingCodeClaim({ codeEmail }) {
  const { refreshAccount } = useAuth();
  return (
    <CodeClaim
      codeEmail={codeEmail}
      send={sendClaimCode}
      verify={verifyClaimCode}
      onApproved={refreshAccount}
      footnote="Can't reach that inbox? No problem — the admin review carries on either way."
    />
  );
}

// Search → details → submit, reusing the public claim form's two business
// steps. The account half of that form is skipped: the session already is
// the account.
function ClaimForm({ preselectedId, moving }) {
  const { claimAsMember } = useAuth();
  const [step, setStep] = useState("search");
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Same preselect as /register?business= — the claim prompt on an unclaimed
  // profile links there, and Register sends a logged-in visitor here.
  useEffect(() => {
    if (!preselectedId) return;
    let cancelled = false;
    fetchBusiness(preselectedId)
      .then((business) => {
        if (cancelled || business.verificationLevel !== UNCLAIMED) return;
        select(business);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [preselectedId]);

  function select(business) {
    setForm({
      ...EMPTY_FORM,
      businessId: business.id,
      businessName: business.name,
      category: business.category,
      location: business.location,
    });
    setStep("details");
  }

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!form.businessName.trim()) next.businessName = "Required";
    if (!form.location.trim()) next.location = "Required";
    if (!form.regNumber.trim()) next.regNumber = "Required";
    if (Object.keys(next).length) return setErrors(next);
    setErrors({});
    setSubmitting(true);
    const result = await claimAsMember({
      businessId: form.businessId ?? undefined,
      businessName: form.businessName.trim(),
      category: form.category,
      location: form.location,
      ssm: form.regNumber.trim(),
    });
    setSubmitting(false);
    if (!result.ok) setErrors({ submit: result.error });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      {moving && (
        <p className="mb-4 text-sm text-muted-foreground">
          A new claim replaces the one you have waiting.
        </p>
      )}
      {step === "search" ? (
        <SearchStep onSelect={select} onManual={() => { setForm(EMPTY_FORM); setStep("details"); }} />
      ) : (
        <>
          <DetailsStep
            form={form}
            errors={errors}
            onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
            onSubmit={submit}
          />
          {errors.submit && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.submit}</p>}
          {submitting && <p className="mt-3 text-sm text-muted-foreground">Submitting…</p>}
          <button
            type="button"
            onClick={() => setStep("search")}
            className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Back to search
          </button>
        </>
      )}
    </div>
  );
}

export { ClaimHome };
