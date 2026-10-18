import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";

import { fetchBusinesses, fetchBusiness, sendSignupClaimCode, verifySignupClaimCode } from "@/lib/api/businesses";
import { CodeClaim } from "@/components/app/CodeClaim";
import { matchesBusinessDomain } from "@/lib/domainVerification";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { BUSINESS_CATEGORIES, BUSINESS_LOCATIONS } from "@/lib/businessVocab";
import { UNCLAIMED } from "@/lib/verificationLevels";



const EMPTY_FORM = {
  businessId: null,
  businessName: "",
  category: BUSINESS_CATEGORIES[0],
  location: "",
  domain: null,
  regNumber: "",
  repName: "",
  repEmail: "",
  repPhone: "",
  repRole: "",
  password: "",
  confirmPassword: "",
  connectTarget: null,
};

// text-base (not text-sm) below md: inputs under 16px make iOS Safari
// auto-zoom on focus, and the zoom tends to stick around after navigating
// away in an SPA.
const fieldClass =
  "w-full rounded-sm border border-grey-300 px-3.5 py-2.5 text-base md:text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow";
const labelClass = "text-[13px] font-bold text-ink dark:text-foreground";
const errorClass = "mt-1 text-[12.5px] text-red-600 dark:text-red-400";

function Register() {
  const { claimOrRegister, isAuthenticated, business: ownBusiness, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("business");
  // The business this claimant scanned a card for and wants to connect
  // with once registration completes — carried as a query param (not
  // router state) because the manual-review path can finish days later, in
  // a different tab, after clicking the emailed confirmation link.
  const connectTarget = searchParams.get("connect");
  // A name carried from an invite. The check-a-business screen produces a
  // link for a business ABRI has NO row for, so unlike ?business= there is
  // nothing to look up — the name is all anybody has, and without this the
  // recipient lands on a search box and types their own company name to be
  // told, correctly, that no unclaimed listing matches it.
  const invitedName = searchParams.get("name");
  const [connectBusinessInfo, setConnectBusinessInfo] = useState(null);
  const baseForm = { ...EMPTY_FORM, connectTarget, businessName: invitedName ?? "" };

  const [step, setStep] = useState("search");
  const [submittedName, setSubmittedName] = useState("");
  // Set when the claimant's email matched the business's domain
  // ("domain-auto") or is the listing's own email ("email-match"): the
  // confirm link they're sent approves the claim on its own. null otherwise.
  const [instantClaim, setInstantClaim] = useState(null);
  // The admin path's confirm-email link, only in local dev (no mail
  // provider) — the same simulated-inbox affordance the domain path has.
  const [confirmToken, setConfirmToken] = useState(null);
  // Admin path only, when the listing has an inbox of its own: the masked
  // address and the handle that lets the submitted screen send it a code
  // before they've logged in. null otherwise.
  const [codeClaim, setCodeClaim] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(baseForm);
  const [errors, setErrors] = useState({});

  // Pre-fills the claim form from a "Claim your business" link on an
  // unclaimed listing's profile page — only takes if the business is still
  // T0 by the time this loads (it may have been claimed by someone else
  // in the meantime).
  useEffect(() => {
    if (!preselectedId) return;
    let cancelled = false;
    fetchBusiness(preselectedId)
      .then((business) => {
        if (cancelled || business.verificationLevel !== UNCLAIMED) return;
        setForm((f) => ({
          ...f,
          businessId: business.id,
          businessName: business.name,
          category: business.category,
          location: business.location,
          domain: business.domain,
        }));
        setStep("details");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [preselectedId]);

  // An invite names a business ABRI has never seen, so searching for it would
  // always come back empty. Straight to `details` with the name filled in —
  // the same jump ?business= makes, minus the lookup, and businessId stays
  // null so this goes through findOrCreateClaimTarget's create branch.
  useEffect(() => {
    if (!invitedName || preselectedId) return;
    setStep("details");
  }, [invitedName, preselectedId]);

  useEffect(() => {
    if (!connectTarget) return;
    let cancelled = false;
    fetchBusiness(connectTarget)
      .then((business) => {
        if (!cancelled) setConnectBusinessInfo(business);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connectTarget]);

  const domainMatch = matchesBusinessDomain(form.repEmail, { domain: form.domain });

  function selectBusiness(business) {
    setForm({
      ...baseForm,
      businessId: business.id,
      businessName: business.name,
      category: business.category,
      location: business.location,
      domain: business.domain,
    });
    setStep("details");
  }

  function startManualEntry() {
    setForm(baseForm);
    setStep("details");
  }

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleDetailsSubmit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!form.businessName.trim()) nextErrors.businessName = "Required";
    if (!form.location.trim()) nextErrors.location = "Required";
    if (!form.regNumber.trim()) nextErrors.regNumber = "Required";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setStep("personal");
  }

  function handlePersonalSubmit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!form.repName.trim()) nextErrors.repName = "Required";
    if (!/^\S+@\S+\.\S+$/.test(form.repEmail))
      nextErrors.repEmail = "Enter a valid email";
    if (!form.repPhone.trim()) nextErrors.repPhone = "Required";
    if (!form.repRole.trim()) nextErrors.repRole = "Required";
    if (form.password.length < 8) nextErrors.password = "At least 8 characters";
    if (form.confirmPassword !== form.password)
      nextErrors.confirmPassword = "Passwords don't match";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setStep("verify");
  }

  // Submits the claim to the backend regardless of the client-side
  // domainMatch guess — the backend makes the real call on which path this
  // lands on (see routes/businesses.js POST /claim) and this branches on
  // its response: requiresEmailVerification shows the (real) verification
  // link inline; requiresAdminApproval moves straight to "submitted".
  //
  // Both paths end on "check your email". This step used to ask for a code
  // "sent to your phone" that nothing sent (any four digits passed), and on
  // the domain path it stayed put after submitting — fine locally, where the
  // link was printed inline, but a dead end once a mail provider is set and
  // the token no longer comes back in the response (lib/mailer.js
  // devOnlyToken).
  async function handleVerifySubmit() {
    setErrors({});
    setSubmitting(true);
    const result = await claimOrRegister(form);
    setSubmitting(false);

    if (!result.ok) {
      setErrors({ submit: result.error });
      return;
    }
    setInstantClaim(result.requiresAdminApproval ? null : result.verificationMethod);
    setSubmittedName(form.businessName);
    setConfirmToken(result.token ?? null);
    setCodeClaim(result.codeEmail && result.claimHandle ? { codeEmail: result.codeEmail, claimHandle: result.claimHandle } : null);
    setStep("submitted");
  }

  // Already logged in: this form would create a second account. An account
  // with no approved business claims from inside the app instead (the claim
  // screen at /app reads the same ?business= preselect); an owner or admin has
  // nothing to claim here.
  if (isAuthenticated) {
    if (ownBusiness || isAdmin) return <Navigate to="/app" replace />;
    return <Navigate to={`/app${preselectedId ? `?business=${encodeURIComponent(preselectedId)}` : ""}`} replace />;
  }

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
      <Link
        to="/directory"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to directory
      </Link>

      <div className="mt-6 rounded-lg border border-grey-200 bg-white p-8 dark:border-border dark:bg-card">
        {step === "search" && (
          <SearchStep onSelect={selectBusiness} onManual={startManualEntry} />
        )}
        {step === "details" && (
          <DetailsStep
            form={form}
            errors={errors}
            onChange={updateField}
            onSubmit={handleDetailsSubmit}
          />
        )}
        {step === "personal" && (
          <PersonalStep
            form={form}
            errors={errors}
            onChange={updateField}
            onBack={() => setStep("details")}
            onSubmit={handlePersonalSubmit}
          />
        )}
        {step === "verify" && (
          <VerifyStep
            form={form}
            errors={errors}
            domainMatch={domainMatch}
            submitting={submitting}
            connectBusinessName={connectBusinessInfo?.name}
            onBack={() => setStep("personal")}
            onSubmit={handleVerifySubmit}
          />
        )}
        {step === "submitted" && (
          <SubmittedStep
            businessName={submittedName}
            email={form.repEmail}
            connectBusinessName={connectBusinessInfo?.name}
            confirmToken={confirmToken}
            instant={instantClaim}
            codeClaim={codeClaim}
          />
        )}
      </div>
    </div>
  );
}

function SearchStep({ onSelect, onManual }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [searchedFor, setSearchedFor] = useState(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchBusinesses({ search: q, verificationLevel: UNCLAIMED })
        .then((businesses) => {
          if (cancelled) return;
          setResults(businesses);
          setStatus("ready");
          setSearchedFor(q);
        })
        .catch(() => {
          if (cancelled) return;
          setStatus("error");
          setSearchedFor(q);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const isSearching = q && searchedFor !== q;

  return (
    <div>
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        Claim your business
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Find your business
      </h1>
      <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
        Search the businesses we've seeded from public registry data. If
        it's already listed, claiming it will carry over its details.
      </p>

      <div className="relative mt-6">
        <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-grey-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by business name or category"
          className={cn(fieldClass, "pl-10")}
          autoFocus
        />
      </div>

      {q && (
        <div className="mt-4 flex flex-col gap-2">
          {isSearching ? (
            <p className="text-[13.5px] text-grey-500 dark:text-muted-foreground">Searching…</p>
          ) : status === "error" ? (
            <p className="text-[13.5px] text-grey-500 dark:text-muted-foreground">
              Something went wrong searching. Please try again.
            </p>
          ) : results.length > 0 ? (
            results.map((business) => (
              <button
                key={business.id}
                type="button"
                onClick={() => onSelect(business)}
                className="rounded-md border border-grey-200 px-4 py-3 text-left transition-colors hover:border-ink hover:bg-surface-2 dark:border-border dark:hover:border-yellow dark:hover:bg-muted"
              >
                <div className="text-sm font-bold text-ink dark:text-foreground">
                  {business.name}
                </div>
                <div className="mt-0.5 text-[12.5px] text-grey-500 dark:text-muted-foreground">
                  {[business.category, business.location].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))
          ) : (
            <p className="text-[13.5px] text-grey-500 dark:text-muted-foreground">
              No unclaimed listings match "{query}".
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onManual}
        className="mt-6 text-sm font-bold text-ink underline-offset-2 hover:underline dark:text-foreground"
      >
        Can't find your business? Register it manually
      </button>
    </div>
  );
}

function DetailsStep({ form, errors, onChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        Claim your business
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Business details
      </h1>
      <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
        {form.businessId
          ? "Confirm your business details below."
          : "Tell us about your business. We'll verify these details against SSM records."}
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label className={labelClass}>Business name</label>
          <input
            type="text"
            value={form.businessName}
            onChange={(e) => onChange("businessName", e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.businessName && (
            <p className={errorClass}>{errors.businessName}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Category</label>
          <select
            value={form.category}
            onChange={(e) => onChange("category", e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
          >
            {BUSINESS_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Location</label>
          {/* A select, not a text input. The directory filters on this column
              by equality, so "PJ" and "Petaling  Jaya" are businesses no search
              can ever return — and they'd never find out.
              The list is in lib/businessVocab.js, mirrored from the server. */}
          <select
            value={form.location}
            onChange={(e) => onChange("location", e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
          >
            <option value="">Select a location</option>
            {BUSINESS_LOCATIONS.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
          {errors.location && <p className={errorClass}>{errors.location}</p>}
        </div>

        <div>
          <label className={labelClass}>SSM registration number</label>
          <input
            type="text"
            value={form.regNumber}
            onChange={(e) => onChange("regNumber", e.target.value)}
            placeholder="e.g. 201801019345"
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.regNumber && <p className={errorClass}>{errors.regNumber}</p>}
          <p className="mt-1 text-[12.5px] text-grey-500 dark:text-muted-foreground">
            The new 12-digit number or the old one (e.g. 1234567-A). An admin
            checks it against SSM records — it's how we know the business is
            yours.
          </p>
        </div>
      </div>

      <button
        type="submit"
        className="mt-8 inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
      >
        Continue
      </button>
    </form>
  );
}

function PersonalStep({ form, errors, onChange, onBack, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        Claim your business
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Your details
      </h1>
      <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
        As the authorised representative, this is how we'll reach you — and
        log in as {form.businessName || "your business"}.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label className={labelClass}>Full name</label>
          <input
            type="text"
            value={form.repName}
            onChange={(e) => onChange("repName", e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.repName && <p className={errorClass}>{errors.repName}</p>}
        </div>

        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={form.repEmail}
            onChange={(e) => onChange("repEmail", e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.repEmail && <p className={errorClass}>{errors.repEmail}</p>}
        </div>

        <div>
          <label className={labelClass}>Phone number</label>
          <input
            type="tel"
            value={form.repPhone}
            onChange={(e) => onChange("repPhone", e.target.value)}
            placeholder="e.g. 012-345 6789"
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.repPhone && <p className={errorClass}>{errors.repPhone}</p>}
        </div>

        <div>
          <label className={labelClass}>Your role at the business</label>
          <input
            type="text"
            value={form.repRole}
            onChange={(e) => onChange("repRole", e.target.value)}
            placeholder="e.g. Director, Owner"
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.repRole && <p className={errorClass}>{errors.repRole}</p>}
        </div>

        <div>
          <label className={labelClass}>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => onChange("password", e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.password && <p className={errorClass}>{errors.password}</p>}
        </div>

        <div>
          <label className={labelClass}>Confirm password</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => onChange("confirmPassword", e.target.value)}
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.confirmPassword && (
            <p className={errorClass}>{errors.confirmPassword}</p>
          )}
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-sm border border-grey-300 px-5 py-2.5 text-[14px] font-bold text-ink transition-colors hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted"
        >
          Back
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
        >
          Continue
        </button>
      </div>
    </form>
  );
}

function SubmittedStep({ businessName, email, connectBusinessName, confirmToken, instant, codeClaim }) {
  // A right listing-email code logs them in as the owner; Register's
  // logged-in redirect then takes them to /app.
  const { applySession } = useAuth();

  return (
    <div>
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        Claim your business
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Check your email
      </h1>
      <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
        We've sent a link to <strong>{email || "your email"}</strong>. Open it to confirm
        your email and log in — you can browse the directory and see every listing's
        details straight away.
      </p>
      {instant ? (
        <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
          {instant === "email-match"
            ? <>Your email is the one listed for {businessName || "this business"}, so opening the
              link also approves your claim.</>
            : <>Your email matches {businessName || "this business"}&rsquo;s website, so opening the
              link also approves your claim.</>} We then check your SSM registration number, usually
          within a couple of business days.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
            Your claim for {businessName || "this business"} is with the ABRI team, who check it
            against your SSM registration, usually within 1–3 business days. We&rsquo;ll email you
            when it&rsquo;s decided.
          </p>
          {codeClaim && (
            <CodeClaim
              codeEmail={codeClaim.codeEmail}
              send={() => sendSignupClaimCode(codeClaim.claimHandle)}
              verify={(code) => verifySignupClaimCode(codeClaim.claimHandle, code).then(applySession)}
              footnote="Can't reach that inbox? No problem — the admin review carries on either way, and you can still send a code once you've logged in."
            />
          )}
        </>
      )}
      {confirmToken && (
        <div className="mt-4 rounded-md border border-grey-200 bg-surface-2 p-4 dark:border-border dark:bg-muted">
          <p className="text-[12.5px] font-bold text-ink dark:text-foreground">
            Simulated email — sent to {email}
          </p>
          <p className="mt-1 text-[12.5px] text-grey-600 dark:text-muted-foreground">
            No mail provider is set up here, so open the link directly.
          </p>
          <Link
            to={`/verify-claim/${confirmToken}`}
            className="mt-3 inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-4 py-2 text-[13px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi"
          >
            Open confirmation link
          </Link>
        </div>
      )}
      {connectBusinessName && (
        <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
          You'll be connected with {connectBusinessName} on ABRI once your claim is
          approved.
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/directory"
          className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
        >
          Back to directory
        </Link>
      </div>
    </div>
  );
}

// The last step: what happens next, then submit. Which path the claim takes
// is the backend's call (routes/businesses.js POST /claim); `domainMatch` is
// only the client's guess, used to pick the explanation.
function VerifyStep({ form, errors, domainMatch, submitting, connectBusinessName, onBack, onSubmit }) {
  function handleSubmit(e) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit}>
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        Claim your business
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        What happens next
      </h1>
      <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-[14px] text-grey-600 dark:text-muted-foreground">
        <li>
          We email a link to <strong>{form.repEmail}</strong>. Open it to confirm your email and
          log in.
        </li>
        {domainMatch ? (
          <li>
            Your email matches {form.businessName || "the business"}&rsquo;s website, so that
            link also approves your claim.
          </li>
        ) : (
          <li>
            The ABRI team reviews your claim, usually within 1–3 business days. You can log in
            and use the directory while you wait.
          </li>
        )}
        <li>
          We check your SSM registration number ({form.regNumber || "the one you gave"}) against the
          SSM register before your business shows as SSM-Verified.
        </li>
        {connectBusinessName && (
          <li>You&rsquo;ll be connected with {connectBusinessName} once your claim is approved.</li>
        )}
      </ul>

      <p className="mt-6 text-[13px] text-grey-500 dark:text-muted-foreground">
        By submitting, you confirm you&rsquo;re authorised to represent this business and agree to
        our{" "}
        <Link to="/terms" className="font-bold text-ink underline underline-offset-2 dark:text-foreground">
          Terms
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className="font-bold text-ink underline underline-offset-2 dark:text-foreground">
          Privacy notice
        </Link>
        .
      </p>

      {errors.submit && <p className={cn(errorClass, "mt-4")}>{errors.submit}</p>}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-sm border border-grey-300 px-5 py-2.5 text-[14px] font-bold text-ink transition-colors hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit claim"}
        </button>
      </div>
    </form>
  );
}

export { Register, SearchStep, DetailsStep, EMPTY_FORM };
