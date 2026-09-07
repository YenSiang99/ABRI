import { Check } from "lucide-react";
import { Link } from "react-router-dom";

import {
  MEMBERSHIP_TIER_ORDER,
  membershipTierLabel,
  membershipTierPitch,
  membershipTierPrice,
  membershipTierPriceNote,
  membershipTierUpgrades,
} from "@/lib/membershipTiers";
import { cn } from "@/lib/utils";

// The public pricing section. Four cumulative cards, each listing only what
// it ADDS over the tier below it.
//
// THIS WAS A FOUR-COLUMN TABLE until Sep 2026, and the reasons for changing
// are worth keeping, because the table was not wrong — it was answering a
// different question:
//
//   A matrix answers "does Pro include testimonials?" — a comparison, read
//   by someone deciding between two plans they already understand.
//   A stack of cards answers "what do I get for RM490?" — which is the
//   question a first-time reader actually arrives with, and the one this
//   page exists to answer.
//
// The matrix cost was real: twenty rows by four columns is eighty cells, of
// which about sixty are a dash or a repeat of the cell above, and it needed
// `min-w-[720px]` inside a keyboard-operable scroll region because four plan
// columns will not fit a phone. These cards need neither.
//
// The trade-off, stated so it can be reversed deliberately: a reader can no
// longer check one specific feature against one specific tier at a glance —
// "everything in Plus" has to be unfolded in their head. That is the cost of
// the clutter going away. If the plans ever stop being strictly cumulative,
// this design breaks and the matrix is the honest answer again.
//
// The DATA is unchanged either way: both shapes read MEMBERSHIP_TIER_FEATURES
// through membershipTierUpgrades, so nothing here restates the matrix in its
// own words. Same source as the in-app cards on pages/app/Plan.jsx — this is
// that component in the marketing skin, which is why the two use different
// palettes (raw colours plus dark: overrides here, semantic slot classes in
// pages/app/) and share their structure.

// Plus is featured rather than Pro: it is the volume tier, and this section's
// job is to move a free member one step, not to sell the top.
const FEATURED_MEMBERSHIP_TIER = "plus";

const CTA = {
  free: { label: "Create free account", to: "/register" },
  plus: { label: "Claim your business", to: "/register" },
  pro: { label: "Claim your business", to: "/register" },
  enterprise: { label: "Talk to us", to: "/register" },
};

function TierCard({ tier }) {
  const featured = tier === FEATURED_MEMBERSHIP_TIER;
  const below = MEMBERSHIP_TIER_ORDER[MEMBERSHIP_TIER_ORDER.indexOf(tier) - 1];
  const features = membershipTierUpgrades(tier);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border p-5",
        featured
          ? "border-ink bg-white shadow-md dark:border-yellow dark:bg-card"
          : "border-grey-200 bg-white dark:border-border dark:bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-extrabold text-ink dark:text-foreground">
          {membershipTierLabel[tier]}
        </span>
        {featured && (
          <span className="rounded-sm bg-yellow px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-yellow-ink">
            Most members
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[26px] leading-none font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
          {membershipTierPrice[tier]}
        </span>
        <span className="text-[11px] font-semibold text-grey-500 dark:text-muted-foreground">
          {membershipTierPriceNote[tier]}
        </span>
      </div>

      {/* Height reserved whether or not the pitch needs it. Enterprise's wraps
          to two lines and the other three don't, and without this the CTA and
          the feature lists start at different heights across the row — which
          is the one thing a side-by-side comparison must not do. Same fix
          pages/app/Plan.jsx makes for the same reason. */}
      <p className="mt-3 min-h-[2.5rem] text-[12.5px] leading-snug text-grey-600 dark:text-muted-foreground">
        {membershipTierPitch[tier]}
      </p>

      <Link
        to={CTA[tier].to}
        className={cn(
          "mt-4 inline-flex w-full items-center justify-center rounded-sm border px-3 py-2 text-[12.5px] leading-none font-bold transition-all hover:-translate-y-px",
          featured
            ? "border-transparent bg-yellow text-yellow-ink hover:bg-yellow-hi hover:shadow-md"
            : "border-grey-300 text-ink hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted",
        )}
      >
        {CTA[tier].label}
      </Link>

      <div className="mt-5 border-t border-grey-100 pt-4 dark:border-border">
        {/* The line that carries the whole design. Free says what it holds;
            every tier above names the one below rather than repeating it, so
            nothing is listed twice and each card is only as long as what it
            actually adds. */}
        <div className="text-[12px] font-bold text-ink dark:text-foreground">
          {below ? `Everything in ${membershipTierLabel[below]}, plus:` : "What you get:"}
        </div>
        <ul className="mt-3 space-y-2">
          {features.map((f) => (
            <li
              key={f.label}
              className="flex items-start gap-2 text-[12.5px] leading-snug text-grey-600 dark:text-muted-foreground"
            >
              {/* A plain lucide tick, deliberately NOT VerificationIcon. That
                  mark's yellow is the SSM-verified colour, and using it as a
                  generic "included" would make every paid row read as a trust
                  claim on the one page where a purchase must never look like
                  one. Same rule the in-app cards follow. */}
              <Check
                className="mt-px h-3.5 w-3.5 flex-none text-ink dark:text-foreground"
                aria-hidden
              />
              <span>
                <span className="text-ink dark:text-foreground">{f.label}</span>
                {/* A colon, not a dash: two labels already contain an em dash
                    ("Asks board — post and answer"), and a second one produced
                    "post and answer — SSM-verified", which reads as a third
                    clause rather than as the value. */}
                {f.detail && <span className="text-grey-600 dark:text-muted-foreground">: {f.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MembershipTierComparison() {
  return (
    // A plain responsive grid. The table this replaced needed a keyboard
    // operable overflow-x region because four columns will not fit a phone;
    // cards stack instead, so the scroll container and its aria plumbing are
    // gone rather than hidden.
    <div className="mx-auto grid max-w-[1000px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {MEMBERSHIP_TIER_ORDER.map((tier) => (
        <TierCard key={tier} tier={tier} />
      ))}
    </div>
  );
}

export { MembershipTierComparison };
