import { Gem } from "lucide-react";

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
//
// ONLY THE SERVICES THIS BUSINESS DELIVERED. An engagement row is shared by
// both ends, and its service describes the work one of them did — so without
// `businessId` this line credited a bakery with the "SST advisory" it had
// bought from its accountant. Mirrors the same rule in
// backend/src/lib/engagements.js, including the fallback: a row with NO
// recorded provider predates that column and is shown to both ends, exactly as
// it always has been.
function servicesFor(entries, businessId) {
  const seen = [];
  for (const e of entries) {
    if (!e.service || seen.includes(e.service)) continue;
    if (businessId && e.serviceProvidedById && e.serviceProvidedById !== businessId) continue;
    seen.push(e.service);
  }
  return seen;
}

function EngagementGroup({ group, businessId }) {
  const { business, entries } = group;
  const services = servicesFor(entries, businessId);
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

// The list itself. `businessName` is only needed on the public profile, where
// the server sends both ends and no resolved counterparty; the owner's view
// passes rows that already carry one.
//
// `businessId` is separate from it and is needed on BOTH views: grouping is by
// name because that is what a public row gives us, but service CREDIT is by id,
// because names are not what the provider column stores. See servicesFor.
function EngagementList({ entries, businessName, businessId, limit = 5, className = "" }) {
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
          <EngagementGroup key={group.business.id} group={group} businessId={businessId} />
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

export { EngagementList, EngagementGroup };
