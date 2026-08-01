import { Link } from "react-router-dom";
import {
  Handshake,
  Eye,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
  Check,
  Circle,
  Award,
  Clock,
} from "lucide-react";
import { StatCard } from "@/components/app/StatCard";
import { AppBusinessCard } from "@/components/app/AppBusinessCard";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { VouchBadge } from "@/components/badge/VouchBadge";
import { useAuth } from "@/context/AuthContext";
import { tierLabel, ladderLabel, listVouchesGivenBy } from "@/lib/store/businesses";
import { businesses, activity, getBusiness } from "@/data/appMockData";

const NEXT_TIER_STEPS = [
  { label: "SSM cross-check confirmed", done: true },
  { label: "Director-name match", done: true },
  { label: "Complete optional eKYC", done: false },
  { label: "Verify representative identity", done: false },
];

const VOUCH_ACTIVITY_TYPES = new Set(["vouch_received", "vouch_thanked"]);

function Dashboard() {
  const { business } = useAuth();
  const suggested = businesses.slice(0, 3);
  const pending = business.tier === "T1";
  const vouchesGivenCount = pending ? 0 : listVouchesGivenBy(business.id).length;
  const visibleActivity = pending
    ? activity.filter((a) => !VOUCH_ACTIVITY_TYPES.has(a.type))
    : activity;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Welcome back
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {business.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <AppTierBadge tier={business.tier} />
            <VouchBadge ladder={business.ladder} />
          </div>
        </div>
        <Link
          to="/app/profile"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          View public profile <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {pending && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-sm font-semibold text-foreground">
              Claimed · SSM verification pending
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Our team is manually cross-checking your registration against SSM
              e-Info records — usually within a couple of business days. Vouching
              and your NFC card unlock once that's done. No action needed from you.
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Vouches received"
          value={pending ? "—" : business.vouches.length}
          hint={pending ? "Unlocks after SSM verification" : "Real peers staking their name"}
          icon={Handshake}
        />
        <StatCard
          label="Vouches given"
          value={pending ? "—" : vouchesGivenCount}
          hint={pending ? "Unlocks after SSM verification" : "Give-first: keep going"}
          icon={TrendingUp}
        />
        <StatCard
          label="Profile views (7d)"
          value={47}
          hint="Petaling Jaya corridor"
          icon={Eye}
        />
        <StatCard
          label="Verification tier"
          value={business.tier}
          hint={tierLabel[business.tier]}
          icon={ShieldCheck}
        />
        <StatCard
          label="Vouch level"
          value={ladderLabel[business.ladder]}
          hint="Based on vouch activity"
          icon={Award}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Progress to T3
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
            Identity-Verified
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete the remaining steps to unlock the T3 badge and Network
            Leader eligibility.
          </p>
          <ul className="mt-5 space-y-3">
            {NEXT_TIER_STEPS.map((step) => (
              <li key={step.label} className="flex items-start gap-3 text-sm">
                {step.done ? (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                    <Check className="h-3 w-3" />
                  </span>
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={
                    step.done
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent activity
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
            What's happening
          </h2>
          <ul className="mt-5 divide-y divide-border">
            {visibleActivity.map((a) => {
              const actor = a.actorId ? getBusiness(a.actorId) : null;
              return (
                <li key={a.id} className="flex items-start gap-3 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-foreground">
                    {actor ? actor.name.charAt(0) : "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">
                      {actor && (
                        <span className="font-medium">{actor.name} </span>
                      )}
                      <span
                        className={
                          actor ? "text-muted-foreground" : "text-foreground"
                        }
                      >
                        {a.message}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.date}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {!pending && (
        <div className="mt-10">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Give first
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Businesses to vouch for
              </h2>
            </div>
            <Link
              to="/app/network"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Browse network →
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {suggested.map((b) => (
              <AppBusinessCard key={b.id} business={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { Dashboard };
