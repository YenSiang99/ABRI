import { Check } from "lucide-react";
import { Link } from "react-router-dom";

import {
  MEMBERSHIP_TIER_ORDER,
  MEMBERSHIP_TIER_FEATURES,
  membershipTierLabel,
  membershipTierPitch,
  membershipTierPrice,
  membershipTierPriceNote,
} from "@/lib/membershipTiers";
import { cn } from "@/lib/utils";

// The four-column pricing table. Split out of Pricing.jsx so the matrix
// rendering can be reused by a logged-in upgrade screen later — that
// version will need the semantic slot classes used across pages/app/
// rather than the raw palette + dark: overrides used here, which is the
// convention split this repo follows between marketing and in-app code.
//
// Plus is the featured column rather than Pro: it's the volume tier, and
// the table's job is to move free members one step, not to sell the top.
const FEATURED_MEMBERSHIP_TIER = "plus";

const CTA = {
  free: { label: "Create free account", to: "/register" },
  plus: { label: "Claim your business", to: "/register" },
  pro: { label: "Claim your business", to: "/register" },
  enterprise: { label: "Talk to us", to: "/register" },
};

// A cell value is either a yes/no or a short quantity. Rendering the
// quantity as text rather than inventing a second icon keeps the column
// scannable — the eye reads "1 card" and "20 / mo" as answers, not as
// exceptions to the tick pattern.
function FeatureCell({ value }) {
  if (value === true) {
    return (
      <span className="inline-flex" title="Included">
        {/* A plain tick, deliberately NOT VerificationIcon. That mark's yellow
            is the SSM-verified colour, and using it as a generic "included" ✓
            made every paid row of this table read as a trust claim — the
            exact collision the chip comment in components/app/AppSidebar.jsx
            warns about, one level up. The billing table gets no yellow and no
            circular trust marks. */}
        <Check className="h-4 w-4 text-foreground" aria-hidden />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === false) {
    // aria-hidden sits on the dash only. Wrapping both in it — as this
    // first did — hides the sr-only text too, and the whole column goes
    // silent to a screen reader.
    return (
      <>
        <span className="text-grey-400 dark:text-grey-600" aria-hidden="true">
          —
        </span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return (
    <span className="text-[13px] font-semibold text-ink dark:text-foreground">{value}</span>
  );
}

function MembershipTierComparison() {
  return (
    // Four plan columns will not fit a phone, so the table scrolls inside
    // its own container rather than forcing the page body sideways. The
    // role/tabIndex pair is what makes a scrollable region operable by
    // keyboard — without it the right-hand columns are mouse-only.
    <div
      role="region"
      aria-label="Membership tier comparison"
      tabIndex={0}
      className="mx-auto max-w-[1000px] overflow-x-auto focus-visible:ring-2 focus-visible:ring-yellow focus-visible:outline-none"
    >
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">
          Feature comparison across the Free, Plus, Pro and Enterprise memberships
        </caption>
        <thead>
          <tr>
            {/* Sticky so the feature name stays readable while the plan
                columns scroll past it on a narrow screen. */}
            <th
              scope="col"
              className="sticky left-0 z-10 w-[38%] bg-surface p-0 align-bottom dark:bg-background"
            >
              <span className="sr-only">Feature</span>
            </th>
            {MEMBERSHIP_TIER_ORDER.map((plan) => (
              <th
                key={plan}
                scope="col"
                className={cn(
                  "border-b border-grey-200 p-3 align-bottom dark:border-border",
                  plan === FEATURED_MEMBERSHIP_TIER &&
                    "rounded-t-lg border-x border-t border-ink bg-white dark:border-yellow dark:bg-card"
                )}
              >
                <span className="block text-[13px] font-extrabold text-ink dark:text-foreground">
                  {membershipTierLabel[plan]}
                </span>
                <span className="mt-1 block text-[11.5px] leading-snug font-normal text-grey-500 dark:text-muted-foreground">
                  {membershipTierPitch[plan]}
                </span>
                <span className="mt-2.5 block text-[22px] leading-none font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
                  {membershipTierPrice[plan]}
                </span>
                <span className="mt-1 block text-[11px] font-semibold text-grey-500 dark:text-muted-foreground">
                  {membershipTierPriceNote[plan]}
                </span>
                <Link
                  to={CTA[plan].to}
                  className={cn(
                    "mt-3 inline-flex w-full items-center justify-center rounded-sm border px-3 py-2 text-[12.5px] leading-none font-bold transition-all hover:-translate-y-px",
                    plan === FEATURED_MEMBERSHIP_TIER
                      ? "border-transparent bg-yellow text-yellow-ink hover:bg-yellow-hi hover:shadow-md"
                      : "border-grey-300 text-ink hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted"
                  )}
                >
                  {CTA[plan].label}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MEMBERSHIP_TIER_FEATURES.map((row) => (
            <tr key={row.label} className="group">
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-grey-100 bg-surface py-2.5 pr-4 text-[13.5px] font-medium text-grey-600 dark:border-border dark:bg-background dark:text-muted-foreground"
              >
                {row.label}
              </th>
              {MEMBERSHIP_TIER_ORDER.map((plan) => (
                <td
                  key={plan}
                  className={cn(
                    "border-b border-grey-100 px-3 py-2.5 text-center dark:border-border",
                    plan === FEATURED_MEMBERSHIP_TIER &&
                      "border-x border-ink bg-white dark:border-yellow dark:bg-card"
                  )}
                >
                  <FeatureCell value={row[plan]} />
                </td>
              ))}
            </tr>
          ))}
          {/* Closes the featured column's border box — without a final row
              the left/right borders end on the last feature row's baseline
              and read as an unfinished outline. */}
          <tr aria-hidden="true">
            <td className="p-0" />
            {MEMBERSHIP_TIER_ORDER.map((plan) => (
              <td
                key={plan}
                className={cn(
                  "h-2 p-0",
                  plan === FEATURED_MEMBERSHIP_TIER &&
                    "rounded-b-lg border-x border-b border-ink bg-white dark:border-yellow dark:bg-card"
                )}
              />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export { MembershipTierComparison };
