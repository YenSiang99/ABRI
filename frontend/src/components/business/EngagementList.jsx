import { Gem, Repeat } from "lucide-react";

import { BusinessAvatar } from "@/components/business/BusinessAvatar";

// One business's engagement rows, shaped like an experience section: a square
// tile, the counterparty's name, the period, and a services line beneath.
//
// SHARED BY BOTH PROFILES ON PURPOSE. The owner's page (pages/app/Profile.jsx)
// and the public page (pages/BusinessProfile.jsx) render the same record and
// promise as much — the owner's panel says "this is what visitors see". Two
// copies of this layout would drift, and the first divergence would make that
// promise false without anything failing.
//
// Roll the rows up by the OTHER BUSINESS, the way an experience section rolls
// several roles up under one employer.
//
// This is the anti-gaming rule made visual, not just a layout choice. The
// panel's headline has always counted distinct counterparties rather than
// rows, for the reason in the comment above; rendering one row per engagement
// worked against that, because ten engagements with a single friendly business
// drew ten lines and looked like the fullest record on the page. Grouped, that
// same collusion draws ONE tile with "10 engagements" inside it, and a record
// built from ten different businesses draws ten tiles. The shape of the panel
// now says what the numbers say.
//
// Insertion order is preserved (the server sends newest first), so the most
// recent counterparty stays at the top.
function groupByCounterparty(entries, businessName) {
  const groups = new Map();
  for (const e of entries) {
    // Both ends are named on a public profile and no `counterparty` is
    // resolved (the server sends null for an anonymous reader), so work out
    // which end is the other one here.
    const other =
      e.counterparty ??
      (e.businessA?.name === businessName ? e.businessB : e.businessA);
    if (!other) continue;
    const existing = groups.get(other.id);
    if (existing) existing.entries.push(e);
    else groups.set(other.id, { business: other, entries: [e] });
  }
  return [...groups.values()];
}

// "Mar 2026", the precision the record actually has — occurredOn is a month a
// member picked, not a timestamp, so printing a day would assert accuracy
// nobody entered.
function monthYear(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

// The span a group covers, in the "Oct 2023 - Present" idiom. Collapses to a
// single date when first and last fall in the same month, which is every group
// holding one engagement — a range of "Mar 2026 - Mar 2026" reads as a bug.
function periodFor(entries) {
  const dates = entries
    .map((e) => new Date(e.occurredOn))
    .sort((a, b) => a - b);
  const first = monthYear(dates[0]);
  const last = monthYear(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

// The services touched by one group, deduplicated and in the order they were
// worked. Rendered on its own line under the dates with a small mark beside
// it, the way a skills line sits under a role.
function servicesFor(entries) {
  const seen = [];
  for (const e of entries) {
    if (e.service && !seen.includes(e.service)) seen.push(e.service);
  }
  return seen;
}

function EngagementGroup({ group }) {
  const { business, entries } = group;
  const services = servicesFor(entries);
  const count = entries.length;
  // Notes belong to single engagements, so only show one when the group holds
  // a single engagement — attributing one row's note to a group of four would
  // describe work it was not written about.
  const note = count === 1 ? entries[0].note : null;

  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <BusinessAvatar name={business.name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink dark:text-foreground">
          {business.name}
        </div>
        <div className="mt-0.5 text-sm text-grey-500 dark:text-muted-foreground">
          {count === 1 ? "1 engagement" : `${count} engagements`}
          {" · "}
          {periodFor(entries)}
        </div>
        {note && (
          <p className="mt-1.5 text-sm text-grey-600 dark:text-muted-foreground">
            {note}
          </p>
        )}
        {services.length > 0 && (
          <div className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-ink dark:text-foreground">
            <Gem className="mt-0.5 h-3.5 w-3.5 shrink-0 text-grey-500 dark:text-muted-foreground" />
            <span className="min-w-0">{services.join(", ")}</span>
          </div>
        )}
      </div>
    </li>
  );
}
// "2 businesses came back for more work."
//
// A COUNT, NOT A RATIO. This had a denominator for a day; see the note on
// repeatSignalFor in backend/src/lib/engagements.js for why it lost one. The
// short version: a rate needs more counterparties than anyone in this network
// has, and it read as a verdict on a sample of four, where a count reads as
// something that grows the next time somebody logs work.
//
// ZERO IS NOT DRAWN FOR A VISITOR. There is no "0 businesses came back" line,
// because a count that starts at zero for every new member would put a null
// result on most profiles in the product and say nothing about any of them —
// it is the absence of evidence, and the panel above it already shows exactly
// how much evidence there is. The owner is the exception: for them a zero is
// the prompt, so `owner` turns it into one.
function RepeatSignal({ repeatCounterparties, owner = false }) {
  if (repeatCounterparties === null || repeatCounterparties === undefined) return null;
  if (!repeatCounterparties && !owner) return null;

  const businesses = `${repeatCounterparties} ${
    repeatCounterparties === 1 ? "business" : "businesses"
  }`;

  if (owner) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-grey-200 px-4 py-3 dark:border-border">
        <div className="flex items-start gap-2 text-sm text-ink dark:text-foreground">
          <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-grey-500 dark:text-muted-foreground" />
          <span>
            {repeatCounterparties === 0 ? (
              <>
                No business has worked with you twice yet.{" "}
                <span className="text-grey-500 dark:text-muted-foreground">
                  When one comes back, visitors see it here.
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">{businesses}</span> came back for
                more work.{" "}
                <span className="text-grey-500 dark:text-muted-foreground">
                  Visitors see this on your profile.
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl bg-grey-100/60 px-4 py-3 text-sm font-medium text-ink dark:bg-muted/40 dark:text-foreground">
      <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-grey-500 dark:text-muted-foreground" />
      <span>{businesses} came back for more work</span>
    </div>
  );
}

// The list itself. `businessName` is only needed on the public profile, where
// the server sends both ends and no resolved counterparty; the owner's view
// passes rows that already carry one.
function EngagementList({ entries, businessName, limit = 5, className = "" }) {
  const groups = groupByCounterparty(entries, businessName);
  const shown = limit ? groups.slice(0, limit) : groups;
  const rest = groups.length - shown.length;

  return (
    <div className={className}>
      {/* divide-y rather than space-y: the rows are a list of separate
          businesses and the hairline between them is what an experience
          section uses to say so. */}
      <ul className="divide-y divide-grey-200 dark:divide-border">
        {shown.map((group) => (
          <EngagementGroup key={group.business.id} group={group} />
        ))}
      </ul>
      {rest > 0 && (
        <p className="mt-3 text-xs text-grey-500 dark:text-muted-foreground">
          and {rest} more {rest === 1 ? "business" : "businesses"}
        </p>
      )}
    </div>
  );
}

export { EngagementList, EngagementGroup, RepeatSignal };
