import { ArrowUpRight, Check } from "lucide-react";
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
        "relative flex flex-col rounded-[8px] px-[23px] py-[26px]",
        featured
          ? "border-2 border-yellow bg-[#FFFBEB] dark:bg-yellow/10"
          : "border border-grey-200 bg-white dark:border-border dark:bg-card",
      )}
    >
      {featured && (
        <span className="absolute -top-[13px] left-1/2 -translate-x-1/2 rounded-[4px] bg-yellow px-3.5 py-[5px] text-[12px] font-semibold whitespace-nowrap text-ink uppercase">
          Most members
        </span>
      )}
      <h3 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-ink dark:text-foreground">
        {membershipTierLabel[tier]}
      </h3>

      {/* Height reserved whether or not the pitch needs it. Enterprise's wraps
          to two lines and the other three don't, and without this the CTA and
          the feature lists start at different heights across the row — which
          is the one thing a side-by-side comparison must not do. Same fix
          pages/app/Plan.jsx makes for the same reason. */}
      <p className="mt-2 min-h-[3rem] text-[14px] leading-[1.7] text-grey-600 dark:text-muted-foreground">
        {membershipTierPitch[tier]}
      </p>

      <div className="mt-5 mb-6">
        <p className="font-display text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-ink sm:text-[40px] dark:text-foreground">
          {membershipTierPrice[tier]}
        </p>
        <p className="mt-1 text-[13px] text-grey-600 dark:text-muted-foreground">
          {membershipTierPriceNote[tier]}
        </p>
      </div>

      <Link
        to={CTA[tier].to}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[6px] border px-4 text-[15px] leading-none font-semibold transition-all duration-200 hover:-translate-y-px",
          featured
            ? "border-transparent bg-yellow text-ink hover:bg-yellow-hi"
            : "border-grey-200 bg-white text-ink hover:border-ink dark:border-border dark:bg-card dark:text-foreground dark:hover:border-foreground",
        )}
      >
        {CTA[tier].label}
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>

      <div className="mt-6">
        {/* The line that carries the whole design. Free says what it holds;
            every tier above names the one below rather than repeating it, so
            nothing is listed twice and each card is only as long as what it
            actually adds. */}
        <div className="text-[14px] font-bold text-ink dark:text-foreground">
          {below ? `Everything in ${membershipTierLabel[below]}, plus:` : "What you get:"}
        </div>
        <ul className="mt-3 grid gap-3">
          {features.map((f) => (
            <li
              key={f.label}
              className="flex items-start gap-2 text-[15px] leading-[1.55] text-grey-600 dark:text-muted-foreground"
            >
              {/* A plain lucide tick, deliberately NOT VerificationIcon. That
                  mark's yellow is the SSM-verified colour, and using it as a
                  generic "included" would make every paid row read as a trust
                  claim on the one page where a purchase must never look like
                  one. Same rule the in-app cards follow. */}
              <Check
                className="mt-[5px] size-3.5 flex-none text-ink dark:text-foreground"
                aria-hidden
              />
              <span>
                <span className="text-ink dark:text-foreground">{f.label}</span>
                {/* A colon, not a dash: a label can already contain an em
                    dash ("Trust feed — endorsements and verifications as they happen"),
                    and a second one reads as a third clause rather than as
                    the value. */}
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
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {MEMBERSHIP_TIER_ORDER.map((tier) => (
        <TierCard key={tier} tier={tier} />
      ))}
    </div>
  );
}

export { MembershipTierComparison };
