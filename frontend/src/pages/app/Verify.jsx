import { Check, Lock, ShieldCheck } from "lucide-react";
import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { useAuth } from "@/context/AuthContext";
import { tierLabel } from "@/lib/store/businesses";
import { cn } from "@/lib/utils";

function buildTierData(account, business) {
  const ssmDone = business.tier !== "T1";
  return [
    {
      tier: "T1",
      blurb: "You claimed this business listing.",
      steps: [
        { id: "email", label: "Confirm work email", done: Boolean(account?.emailVerified) },
        { id: "phone", label: "Confirm phone number", done: Boolean(account?.phoneVerified) },
      ],
      unlocks: "Basic profile page and directory listing.",
    },
    {
      tier: "T2",
      blurb: ssmDone
        ? "SSM records cross-checked against your registration."
        : "Pending manual review by the ABRI team — usually within a couple of business days.",
      steps: [
        { id: "ssm", label: "SSM entity match", done: ssmDone },
        { id: "director", label: "Director-name match", done: ssmDone },
      ],
      unlocks: "SSM-Verified badge · eligible to give and receive vouches · NFC card unlocked.",
    },
    {
      tier: "T3",
      blurb: "Optional identity verification (eKYC) — coming in a later stage.",
      steps: [
        { id: "id", label: "Government ID upload", done: false },
        { id: "selfie", label: "Liveness selfie check", done: false },
      ],
      unlocks: "Identity-Verified badge · Network Leader eligibility.",
    },
    {
      tier: "T4",
      blurb: "Transaction history verified through the network — coming in a later stage.",
      steps: [
        { id: "tx1", label: "First closed transaction on-platform", done: false },
        { id: "tx3", label: "3+ transactions across distinct counterparties", done: false },
      ],
      unlocks: "Transaction-Trusted badge · escrow-eligible.",
    },
  ];
}

function Verify() {
  const { account, business } = useAuth();
  const TIER_DATA = buildTierData(account, business);
  const currentIndex = TIER_DATA.findIndex((t) => t.tier === business.tier);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Verification Center
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Trust, built in layers
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Every tier is a verifiable claim, not a self-assertion. Climb the ladder to unlock the next surface of the
          network.
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current tier</div>
            <div className="mt-2">
              <VerificationBadge tier={business.tier} size="profile" />
            </div>
          </div>
        </div>
        {business.tier === "T1" && (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">SSM verification: pending manual review.</span>{" "}
            Our team cross-checks your registration against SSM e-Info records — usually within a couple of
            business days. No action needed from you.
          </div>
        )}
      </div>

      <div className="mt-10 space-y-4">
        {TIER_DATA.map((t, idx) => {
          const status = idx < currentIndex ? "done" : idx === currentIndex ? "current" : "locked";
          const isNext = idx === currentIndex + 1;

          return (
            <div
              key={t.tier}
              className={cn(
                "rounded-2xl border p-6 transition-colors",
                status === "done" && "border-border bg-card",
                status === "current" && "border-foreground bg-card shadow-sm",
                status === "locked" && !isNext && "border-border bg-card/50 opacity-70",
                isNext && "border-accent bg-card",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
                      status === "done" && "bg-foreground text-background",
                      status === "current" && "bg-accent text-accent-foreground",
                      status === "locked" && "bg-secondary text-muted-foreground",
                    )}
                  >
                    {status === "done" ? (
                      <Check className="h-5 w-5" />
                    ) : status === "locked" ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <ShieldCheck className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">{t.tier}</span>
                      <span className="text-sm text-muted-foreground">·</span>
                      <span className="text-lg font-semibold tracking-tight text-foreground">
                        {tierLabel[t.tier]}
                      </span>
                    </div>
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t.blurb}</p>
                  </div>
                </div>
                {status === "current" && <AppTierBadge tier={t.tier} />}
              </div>

              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {t.steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        s.done ? "border-foreground bg-foreground text-background" : "border-border bg-transparent",
                      )}
                    >
                      {s.done && <Check className="h-3 w-3" />}
                    </span>
                    <span className={s.done ? "text-muted-foreground line-through" : "text-foreground"}>
                      {s.label}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Unlocks:</span> {t.unlocks}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { Verify };
