import { Link } from "react-router-dom";
import { ArrowUpRight, Briefcase, CircleCheck, Clock, MapPin } from "lucide-react";

import { Eyebrow } from "@/components/sections/Eyebrow";
import {
  BTN,
  BTN_PRIMARY,
  CONTAINER,
  H2,
  LEAD,
  SAMPLE_TAG,
} from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// Illustrative requests, not live data: ABRI has no opportunities board at the
// moment (the asks board came out in Sep 2026), and the fine print under the
// cards says so. The poster names are made up and meant to read that way.
const REQUESTS = [
  {
    category: "Legal",
    ask: "Looking for a corporate lawyer for a shareholder agreement",
    chips: ["Kuala Lumpur", "Within 2 weeks", "One-off project"],
    expertise: ["Corporate law", "Shareholder agreements", "Experience with SMEs"],
    poster: { initials: "CT", name: "Contoh Trading Sdn Bhd" },
  },
  {
    category: "Logistics",
    ask: "Need a reliable logistics partner for weekly deliveries",
    chips: ["Petaling Jaya", "Start next month", "Ongoing"],
    poster: { initials: "SF", name: "Sampel Foods Enterprise" },
  },
  {
    category: "Accounting",
    ask: "Seeking a bookkeeper familiar with e-invoicing for a small firm",
    chips: ["Shah Alam", "Within 1 month", "Ongoing"],
    poster: { initials: "ED", name: "Example Design Studio" },
  },
];

const CHIP_ICONS = [MapPin, Clock, Briefcase];

function RequestTicket({ request, featured = false }) {
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border border-grey-200 bg-white transition-all duration-200 hover:-translate-y-[3px] hover:shadow-[0_12px_40px_rgba(17,24,39,0.10)] dark:border-border dark:bg-card",
        featured ? "border-t-[5px] border-t-yellow p-[22px] sm:px-8 sm:pt-[34px] sm:pb-[30px] dark:border-t-yellow" : "p-[22px] sm:p-[26px]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-yellow px-3 py-[5px] text-[12px] font-bold tracking-[0.04em] text-ink uppercase">
          {request.category}
        </span>
        <span className={SAMPLE_TAG}>Sample</span>
      </div>

      <h3
        className={cn(
          "font-display font-bold tracking-[-0.015em] text-ink dark:text-foreground",
          featured
            ? "mt-[26px] mb-[22px] max-w-[460px] text-[26px] leading-[1.2] md:text-[30px]"
            : "mt-[18px] mb-4 text-[20px] leading-[1.35]",
        )}
      >
        {request.ask}
      </h3>

      <ul className="flex flex-wrap gap-2">
        {request.chips.map((chip, i) => {
          const Icon = CHIP_ICONS[i];
          return (
            <li
              key={chip}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] text-ink dark:bg-muted dark:text-foreground"
            >
              <Icon className="size-3.5 text-grey-500 dark:text-muted-foreground" aria-hidden />
              {chip}
            </li>
          );
        })}
      </ul>

      {request.expertise && (
        <div className="mt-[26px] mb-[30px] rounded-[10px] bg-background px-5 py-[18px] dark:bg-muted">
          <p className="text-[12px] font-bold tracking-[0.1em] text-grey-600 uppercase dark:text-muted-foreground">
            Expertise wanted
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {request.expertise.map((e) => (
              <li
                key={e}
                className="rounded-[6px] border border-grey-200 bg-white px-2.5 py-1.5 text-[14px] font-semibold text-ink dark:border-border dark:bg-card dark:text-foreground"
              >
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The ticket's tear line: a dashed rule with a half-circle notch cut
          into each edge, filled with the page colour so it reads as a hole. */}
      <div
        className={cn(
          "relative border-t-2 border-dashed border-grey-200 dark:border-border",
          featured ? "-mx-[23px] mt-auto mb-5 sm:-mx-[33px]" : "-mx-[23px] mt-[22px] mb-[18px] sm:-mx-[27px]",
        )}
        aria-hidden
      >
        <span className="absolute -top-[11px] -left-[11px] size-5 rounded-full border border-grey-200 bg-background [clip-path:inset(0_0_0_50%)] dark:border-border" />
        <span className="absolute -top-[11px] -right-[11px] size-5 rounded-full border border-grey-200 bg-background [clip-path:inset(0_50%_0_0)] dark:border-border" />
      </div>

      <div className={cn("flex flex-wrap items-center justify-between gap-3", !featured && "mt-auto")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-[38px] flex-none place-items-center rounded-full bg-ink font-display text-[13px] font-bold text-yellow dark:bg-grey-700"
            aria-hidden
          >
            {request.poster.initials}
          </span>
          <div>
            <p className="text-[14px] font-semibold text-ink dark:text-foreground">{request.poster.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-grey-500 dark:text-muted-foreground">
              <CircleCheck className="size-[13px] text-yellow-hi" aria-hidden />
              ABRI Verified
            </p>
          </div>
        </div>
        <Link
          to="/register"
          className={cn(
            BTN,
            "flex-none",
            featured
              ? "border-yellow bg-yellow text-ink hover:border-yellow-hi hover:bg-yellow-hi"
              : "border-grey-200 bg-white text-ink group-hover:border-yellow group-hover:bg-yellow dark:border-border dark:bg-card dark:text-foreground dark:group-hover:text-ink",
          )}
        >
          Respond
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function OpportunityHub() {
  const [featured, ...rest] = REQUESTS;
  return (
    <section id="opportunities" className={cn(CONTAINER, "pt-20 pb-16 md:pt-[120px] md:pb-24")}>
      <div className="mb-8 flex flex-col gap-4">
        <div>
          <Eyebrow>Real business needs</Eyebrow>
          <h2 className={H2}>Opportunity Hub</h2>
          <p className={LEAD}>
            Need a supplier, specialist or partner? See what members need, offer your help and make the match.
          </p>
        </div>
        <Link to="/register" className={cn(BTN_PRIMARY, "self-start")}>
          Explore opportunities
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <RequestTicket request={featured} featured />
        <div className="grid gap-5">
          {rest.map((r) => (
            <RequestTicket key={r.ask} request={r} />
          ))}
        </div>
      </div>

      <p className="mt-5 text-center text-[13px] text-grey-600 dark:text-muted-foreground">
        A glimpse of what’s possible. Posts are illustrative; live member opportunities will appear at launch.
      </p>
    </section>
  );
}

export { OpportunityHub };
