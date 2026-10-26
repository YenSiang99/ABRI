import { Link } from "react-router-dom";
import { Briefcase, CircleCheck, Clock, MapPin } from "lucide-react";

import { Eyebrow } from "@/components/sections/Eyebrow";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  CARD,
  CARD_TITLE,
  CONTAINER,
  H2,
  LEAD,
  SAMPLE_TAG,
  SECTION_Y,
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
        CARD,
        "relative flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-md",
        featured && "border-t-4 border-t-yellow",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-sm bg-yellow-soft px-2 py-1 text-[11px] font-bold tracking-[0.14em] text-yellow-ink uppercase dark:bg-yellow/15 dark:text-yellow">
          {request.category}
        </span>
        <span className={SAMPLE_TAG}>Sample</span>
      </div>

      <h3
        className={cn(
          featured
            ? "mt-[18px] mb-4 max-w-[460px] text-[clamp(24px,2.8vw,32px)] leading-[1.15] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground"
            : cn(CARD_TITLE, "mt-[18px] mb-3.5"),
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
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-surface-2 px-2.5 py-1 text-[13px] text-grey-600 dark:bg-muted dark:text-muted-foreground"
            >
              <Icon className="size-3.5 text-grey-500 dark:text-muted-foreground" aria-hidden />
              {chip}
            </li>
          );
        })}
      </ul>

      {request.expertise && (
        <div className="my-[18px] overflow-hidden rounded-md border border-grey-200 dark:border-border">
          <p className="border-b border-grey-200 bg-surface px-3.5 py-2 text-[11px] font-semibold tracking-[0.08em] text-grey-500 uppercase dark:border-border dark:bg-muted dark:text-muted-foreground">
            Expertise wanted
          </p>
          <ul className="flex flex-wrap gap-2 px-3.5 py-3">
            {request.expertise.map((e) => (
              <li
                key={e}
                className="rounded-[5px] bg-yellow-soft px-2 py-0.5 text-[13.5px] text-yellow-ink dark:bg-yellow/15 dark:text-yellow"
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
          featured ? "-mx-[31px] mt-auto mb-[18px]" : "-mx-[31px] mt-[18px] mb-[18px]",
        )}
        aria-hidden
      >
        <span className="absolute -top-[11px] -left-[11px] size-5 rounded-full border border-grey-200 bg-background [clip-path:inset(0_0_0_50%)] dark:border-border" />
        <span className="absolute -top-[11px] -right-[11px] size-5 rounded-full border border-grey-200 bg-background [clip-path:inset(0_50%_0_0)] dark:border-border" />
      </div>

      <div className={cn("flex flex-wrap items-center justify-between gap-3", !featured && "mt-auto")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid size-9 flex-none place-items-center rounded-xl bg-ink text-[13px] font-extrabold text-yellow dark:bg-grey-700"
            aria-hidden
          >
            {request.poster.initials}
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-ink dark:text-foreground">{request.poster.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-grey-500 dark:text-muted-foreground">
              <CircleCheck className="size-[13px] text-yellow" aria-hidden />
              ABRI Verified
            </p>
          </div>
        </div>
        <Link
          to="/register"
          className={cn(featured ? BTN_PRIMARY : BTN_OUTLINE, "flex-none px-4 py-2.5 text-sm")}
        >
          Respond
        </Link>
      </div>
    </article>
  );
}

function OpportunityHub() {
  const [featured, ...rest] = REQUESTS;
  return (
    <section id="opportunities" className={cn(CONTAINER, SECTION_Y)}>
      <div className="mb-13 flex flex-col gap-6">
        <div className="max-w-[640px]">
          <Eyebrow>Real business needs</Eyebrow>
          <h2 className={H2}>Opportunity Hub</h2>
          <p className={LEAD}>
            Need a supplier, specialist or partner? See what members need, offer your help and make the match.
          </p>
        </div>
        <Link to="/register" className={cn(BTN_PRIMARY, "self-start")}>
          Explore opportunities
        </Link>
      </div>

      <div className="grid items-stretch gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <RequestTicket request={featured} featured />
        <div className="grid gap-5">
          {rest.map((r) => (
            <RequestTicket key={r.ask} request={r} />
          ))}
        </div>
      </div>

      <p className="mt-11 text-center text-[15px] text-grey-500 italic dark:text-muted-foreground">
        A glimpse of what’s possible. Posts are illustrative; live member opportunities will appear at launch.
      </p>
    </section>
  );
}

export { OpportunityHub };
