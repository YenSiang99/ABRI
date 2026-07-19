import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";

import { useBusinesses } from "@/lib/store/businesses";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "Corporate Secretarial",
  "Accounting & Tax",
  "Law",
  "IT Consulting",
];

const EMPTY_FORM = {
  businessId: null,
  businessName: "",
  category: CATEGORIES[0],
  location: "",
  regNumber: "",
  repName: "",
  repEmail: "",
  repPhone: "",
  repRole: "",
  password: "",
  confirmPassword: "",
};

const fieldClass =
  "w-full rounded-sm border border-grey-300 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow";
const labelClass = "text-[13px] font-bold text-ink dark:text-foreground";
const errorClass = "mt-1 text-[12.5px] text-red-600 dark:text-red-400";

function Register() {
  const businesses = useBusinesses();
  const { claimOrRegister } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("business");
  const preselected = businesses.find(
    (b) => b.id === preselectedId && b.tier === "T0",
  );

  const [step, setStep] = useState(preselected ? "details" : "search");
  const [submittedName, setSubmittedName] = useState("");
  const [form, setForm] = useState(
    preselected
      ? {
          ...EMPTY_FORM,
          businessId: preselected.id,
          businessName: preselected.name,
          category: preselected.category,
          location: preselected.location,
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState({});

  function selectBusiness(business) {
    setForm({
      ...EMPTY_FORM,
      businessId: business.id,
      businessName: business.name,
      category: business.category,
      location: business.location,
    });
    setStep("details");
  }

  function startManualEntry() {
    setForm(EMPTY_FORM);
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

  function handleVerifySubmit({ emailCode, phoneCode }) {
    const nextErrors = {};
    if (emailCode.trim().length < 4) nextErrors.emailCode = "Enter the code we sent";
    if (phoneCode.trim().length < 4) nextErrors.phoneCode = "Enter the code we sent";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const result = claimOrRegister(form);
    if (!result.ok) {
      setErrors({ submit: result.error });
      return;
    }
    setSubmittedName(form.businessName);
    setStep("submitted");
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
          <SearchStep businesses={businesses} onSelect={selectBusiness} onManual={startManualEntry} />
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
            onBack={() => setStep("personal")}
            onSubmit={handleVerifySubmit}
          />
        )}
        {step === "submitted" && <SubmittedStep businessName={submittedName} />}
      </div>
    </div>
  );
}

function SearchStep({ businesses, onSelect, onManual }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? businesses.filter(
        (b) =>
          b.tier === "T0" &&
          (b.name.toLowerCase().includes(q) ||
            b.category.toLowerCase().includes(q)),
      )
    : [];

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
          {matches.length > 0 ? (
            matches.map((business) => (
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
                  {business.category} · {business.location}
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
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Location</label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => onChange("location", e.target.value)}
            placeholder="e.g. Petaling Jaya"
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.location && <p className={errorClass}>{errors.location}</p>}
        </div>

        <div>
          <label className={labelClass}>
            SSM registration number{" "}
            <span className="font-normal text-grey-500 dark:text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            value={form.regNumber}
            onChange={(e) => onChange("regNumber", e.target.value)}
            placeholder="e.g. 201801019345"
            className={cn(fieldClass, "mt-1.5")}
          />
          <p className="mt-1 text-[12.5px] text-grey-500 dark:text-muted-foreground">
            We'll match this against official SSM records during
            verification.
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

function SubmittedStep({ businessName }) {
  return (
    <div>
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        Claim your business
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Claim submitted
      </h1>
      <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
        Thanks — your claim on {businessName || "this business"} is now pending
        admin review. We manually check that you're authorised to represent
        the business before granting login access; you'll get an email once
        it's approved. This is separate from (and happens before) SSM
        verification.
      </p>
      <Link
        to="/directory"
        className="mt-8 inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
      >
        Back to directory
      </Link>
    </div>
  );
}

function VerifyStep({ form, errors, onBack, onSubmit }) {
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ emailCode, phoneCode });
  }

  return (
    <form onSubmit={handleSubmit}>
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        Claim your business
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Verify it's you
      </h1>
      <p className="mt-2 text-[14px] text-grey-600 dark:text-muted-foreground">
        This confirms you control {form.repEmail || "your email"} and{" "}
        {form.repPhone || "your phone"} — it doesn't confirm you own the
        business. We'll manually cross-check {form.businessName || "your business"}{" "}
        against SSM records separately before showing the SSM-Verified badge.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <label className={labelClass}>
            Code sent to {form.repEmail || "your email"}{" "}
            <span className="font-normal text-grey-500 dark:text-muted-foreground">
              (demo — enter any 4+ digit code)
            </span>
          </label>
          <input
            type="text"
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value)}
            placeholder="123456"
            className={cn(fieldClass, "mt-1.5")}
            autoFocus
          />
          {errors.emailCode && <p className={errorClass}>{errors.emailCode}</p>}
        </div>

        <div>
          <label className={labelClass}>
            Code sent to {form.repPhone || "your phone"}{" "}
            <span className="font-normal text-grey-500 dark:text-muted-foreground">
              (demo — enter any 4+ digit code)
            </span>
          </label>
          <input
            type="text"
            value={phoneCode}
            onChange={(e) => setPhoneCode(e.target.value)}
            placeholder="123456"
            className={cn(fieldClass, "mt-1.5")}
          />
          {errors.phoneCode && <p className={errorClass}>{errors.phoneCode}</p>}
        </div>

        <button
          type="button"
          className="self-start text-[13px] font-bold text-ink underline-offset-2 hover:underline dark:text-foreground"
        >
          Resend codes
        </button>
      </div>

      {errors.submit && <p className={cn(errorClass, "mt-4")}>{errors.submit}</p>}

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
          Verify &amp; finish
        </button>
      </div>
    </form>
  );
}

export { Register };
