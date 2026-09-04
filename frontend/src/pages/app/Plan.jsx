import { Check, Minus } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  MEMBERSHIP_TIER_ORDER,
  canUpgradeFromMembershipTier,
  membershipTierLabel,
  membershipTierPitch,
  membershipTierPrice,
  membershipTierPriceNote,
  membershipTierUpgrades,
} from "@/lib/membershipTiers";
import { cn } from "@/lib/utils";

// The in-app membership screen. CARDS, where the public
// components/sections/MembershipTierComparison.jsx is a MATRIX — the same
// four tiers and the same lib/membershipTiers.js data, presented for two
// different readers on purpose.
//
// A visitor at /#pricing hasn't chosen anything yet and is comparing four
// unknowns against each other, which is what a matrix is for. A member
// arriving here has already chosen: they are on a tier, they hit a wall, and
// the only live question is "what does the next one give me". Cards answer
// that; a 16-row grid makes them find their own column first.
//
// This also fixes where those members used to land. Every upgrade CTA in the
// app pointed at /#pricing, which threw a logged-in member out of the app
// shell and onto the marketing site to read about a product they'd bought.
//
// Semantic slot classes only (bg-card, text-muted-foreground, border-border),
// never the raw marketing palette with dark: overrides — the convention split
// flagged in MembershipTierComparison.jsx's own header.

// The lower tiers get no button. A Free member does not need an affordance
// for "downgrade to nothing", and offering one on a Pro member's screen
// invites a support ticket the product can't service — there is no billing
// flow behind any of this yet. `to` matches the public table's CTAs, which
// are also the only destinations that exist.
function ctaFor(tier, currentTier) {
  const i = MEMBERSHIP_TIER_ORDER.indexOf(tier);
  const current = MEMBERSHIP_TIER_ORDER.indexOf(currentTier);
  if (i === current) return { label: "Current plan", current: true };
  if (i < current) return null;
  if (tier === "enterprise") return { label: "Talk to us", to: "/register" };
  return { label: `Upgrade to ${membershipTierLabel[tier]}`, to: "/register" };
}

function TierCard({ tier, currentTier }) {
  const cta = ctaFor(tier, currentTier);
  const isCurrent = tier === currentTier;
  const below = MEMBERSHIP_TIER_ORDER[MEMBERSHIP_TIER_ORDER.indexOf(tier) - 1];
  const features = membershipTierUpgrades(tier);

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-5",
        isCurrent ? "border-foreground bg-card shadow-sm" : "border-border bg-card",
      )}
    >
      {/* The squared mono chip, never a badge and never yellow. This page
          sells the one axis that is for sale, which makes it the page most
          at risk of dressing a purchase up as a trust signal — see the chip
          comment in components/app/AppSidebar.jsx. */}
      <span className="w-fit rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {membershipTierLabel[tier]}
      </span>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight text-foreground">
          {membershipTierPrice[tier]}
        </span>
        <span className="text-xs text-muted-foreground">{membershipTierPriceNote[tier]}</span>
      </div>

      {/* Two lines reserved whether or not the pitch needs them. Enterprise's
          wraps and the other three don't, and without this the CTA row and
          the feature list start at a different height in that one card,
          which is the thing a four-across comparison must not do. */}
      <p className="mt-3 min-h-[2.5rem] text-sm text-foreground">{membershipTierPitch[tier]}</p>

      <div className="mt-5">
        {cta ? (
          cta.current ? (
            <Button variant="outline" size="lg" className="w-full" disabled>
              {cta.label}
            </Button>
          ) : (
            <Button
              variant={isCurrent ? "outline" : "default"}
              size="lg"
              className="w-full"
              render={<Link to={cta.to} />}
              nativeButton={false}
            >
              {cta.label}
            </Button>
          )
        ) : (
          // A spacer, not a hidden element: without it the feature lists in
          // the four cards start at different heights and stop being
          // comparable across the row, which is the only reason to show
          // them side by side.
          <div className="h-9" aria-hidden />
        )}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <div className="text-xs font-medium text-foreground">
          {below ? `Everything in ${membershipTierLabel[below]}, plus:` : "Included:"}
        </div>
        <ul className="mt-3 space-y-2">
          {features.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-xs text-muted-foreground">
              {/* A plain lucide tick. NOT VerificationIcon — its yellow is
                  the SSM-verified colour, and using it here would make every
                  paid row read as a trust claim. Same rule the public table
                  follows in MembershipTierComparison.jsx's FeatureCell. */}
              <Check className="mt-px h-3.5 w-3.5 flex-none text-foreground" aria-hidden />
              <span>
                <span className="text-foreground">{f.label}</span>
                {/* A colon, not a dash. A label may itself contain an em
                    dash, and joining with another one reads as a third
                    clause rather than as the value. */}
                {f.detail && <span className="text-muted-foreground">: {f.detail}</span>}
              </span>
            </li>
          ))}
          {features.length === 0 && (
            <li className="flex items-start gap-2 text-xs text-muted-foreground">
              <Minus className="mt-px h-3.5 w-3.5 flex-none" aria-hidden />
              <span>Nothing this tier adds on its own.</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Plan() {
  const { business } = useAuth();
  const currentTier = business.membershipTier;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your membership
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          What you're paying for
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">You're on</span>
          <span className="inline-flex rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {membershipTierLabel[currentTier]}
          </span>
          {business.isFoundingMember && (
            <span className="inline-flex rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Founding
            </span>
          )}
          {!canUpgradeFromMembershipTier(currentTier) && (
            <span className="text-sm text-muted-foreground">— the top tier.</span>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MEMBERSHIP_TIER_ORDER.map((tier) => (
          <TierCard key={tier} tier={tier} currentTier={currentTier} />
        ))}
      </div>

      {/* The sentence that keeps this page honest, carried over from the
          retired /app/levels. It belongs on the page doing the selling more
          than it belonged on a neutral explainer: the moment to say a tier
          buys you nothing in the way of trust is while somebody is deciding
          whether to buy one. */}
      <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
        <span className="font-medium text-foreground">A membership tier is not a trust signal.</span>{" "}
        It says nothing about whether you're real, or whether anyone will stand behind you. That's
        why it's set in grey monospace and never as a badge — your{" "}
        <Link to="/app/verify" className="font-medium text-foreground underline underline-offset-4">
          verification level
        </Link>{" "}
        and your{" "}
        <Link to="/app/vouches" className="font-medium text-foreground underline underline-offset-4">
          vouch level
        </Link>{" "}
        are earned, and neither is for sale.
      </p>
    </div>
  );
}

export { Plan };
