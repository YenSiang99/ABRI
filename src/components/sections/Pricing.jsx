import { Link } from "react-router-dom";

import { VerificationIcon } from "@/components/badge/VerificationIcon";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    flag: "Standard",
    heading: "For the business owner",
    price: "RM490",
    features: [
      "Full verified profile + SSM badge",
      "NFC card included",
      "Directory presence · vouching",
    ],
    valueLine:
      "One referral from a verified partner typically covers this several times over.",
    cta: "Claim your business",
    featured: true,
  },
  {
    flag: null,
    heading: "Business — for teams",
    price: "RM1,490",
    features: [
      "Up to 10 verified team profiles",
      "Multiple NFC cards",
      "Priority support",
    ],
    valueLine:
      "One trusted profile for the whole team — not ten different cards.",
    cta: "Talk to us",
    featured: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="pt-0 pb-[60px] md:pb-[104px]">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto mb-13 max-w-[640px] text-center">
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
            Membership
          </span>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
            Simple, transparent membership.
          </h2>
          <p className="mt-3.5 text-[17px] text-grey-600 dark:text-muted-foreground">
            One good connection covers the year. Everything below is annual —
            ABRI is a network you join, not software you subscribe to.
          </p>
        </div>

        <div className="mx-auto grid max-w-[380px] grid-cols-1 gap-5 md:max-w-[780px] md:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.heading}
              className={cn(
                "relative flex flex-col gap-2 rounded-lg border border-grey-200 bg-white p-8 dark:border-border dark:bg-card",
                plan.featured && "border-ink shadow-md dark:border-yellow"
              )}
            >
              {plan.flag && (
                <span className="absolute -top-3 left-[26px] rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-white uppercase dark:bg-grey-700">
                  {plan.flag}
                </span>
              )}
              <h3 className="text-base font-extrabold text-ink dark:text-foreground">
                {plan.heading}
              </h3>
              <div className="text-[32px] font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
                {plan.price}{" "}
                <small className="text-sm font-semibold text-grey-500 dark:text-muted-foreground">
                  / year
                </small>
              </div>
              <ul className="mt-2.5 grid gap-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="grid grid-cols-[20px_1fr] gap-2 text-sm text-grey-600 dark:text-muted-foreground"
                  >
                    <VerificationIcon tier="verified" size="small" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-3.5 border-t border-grey-100 pt-3.5 text-[13.5px] text-grey-500 italic dark:border-border dark:text-muted-foreground">
                {plan.valueLine}
              </div>
              <Link
                to="/register"
                className={cn(
                  "mt-4 inline-flex items-center justify-center gap-2 rounded-sm border border-transparent px-[22px] py-[13px] text-[15px] leading-none font-bold transition-all hover:-translate-y-px",
                  plan.featured
                    ? "bg-yellow text-yellow-ink hover:bg-yellow-hi hover:shadow-md"
                    : "border-grey-300 text-ink hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted"
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-11 max-w-[640px] rounded-md bg-surface-2 px-7 py-5 text-center text-[14.5px] text-grey-600 dark:bg-muted dark:text-muted-foreground">
          <b className="text-ink dark:text-foreground">Founding 100 — by invitation only.</b> The
          first hundred members of ABRI are hand-picked businesses invited to
          anchor the network. Founding members carry the founding badge
          permanently. If you believe your business belongs in the first
          hundred,{" "}
          <a href="#" className="border-b-2 border-yellow font-bold text-ink dark:text-foreground">
            request an invitation →
          </a>
        </div>

        <div className="mt-[22px] text-center text-sm text-grey-500 dark:text-muted-foreground">
          Just want to look around first?{" "}
          <Link
            to="/register"
            className="border-b-2 border-yellow font-bold text-ink dark:text-foreground"
          >
            Create a free account
          </Link>{" "}
          — browse verified businesses, no card required. Verification is
          what unlocks the network.
        </div>
      </div>
    </section>
  );
}

export { Pricing };