import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Building2, MapPin } from "lucide-react";

import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { ContactDetails } from "@/components/business/ContactDetails";
import { UNCLAIMED } from "@/lib/verificationLevels";

// One business, presented for a reader who has just met it — with the verdict
// slotted underneath as `children`.
//
// Lifted out of pages/CardTap.jsx, where it was a private function, when the
// check-a-business screen turned out to want exactly the same thing: a
// stranger's name, category, location and standing, with contact details
// below and a decision below that. Two copies of this layout would have
// drifted the first time either page changed, and the rule the layout encodes
// (below) is the one that must not drift.
//
// THE RULE THIS COMPONENT EXISTS TO ENFORCE, carried over verbatim from
// CardTap: verification status renders BEFORE contact details, always. That
// is structural here rather than a convention each caller remembers — a
// screen that shows you a phone number before telling you whether the name
// attached to it was ever checked has the whole product backwards.
function BusinessPanel({ business, eyebrow, basePath = "/business", children }) {
  const location = useLocation();
  const Icon = eyebrow?.icon;

  return (
    <div className="mt-6 rounded-3xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-2xl font-semibold text-yellow dark:bg-foreground dark:text-background">
            {business.name.charAt(0)}
          </div>
          <div>
            {/* How the reader got here — "Tapped a card" or "Lookup result".
                A prop rather than a constant because the two callers arrive by
                genuinely different routes, and a panel that claimed a card had
                been tapped when somebody typed a name would be inventing an
                event. */}
            {eyebrow && (
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {Icon && <Icon className="h-3.5 w-3.5" />} {eyebrow.label}
                </span>
              </div>
            )}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink dark:text-foreground md:text-3xl">
              {business.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-grey-600 dark:text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> {business.category}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {business.location}
              </span>
            </div>
            <div className="mt-3">
              <VerificationBadge verificationLevel={business.verificationLevel} size="inline" chip />
            </div>
          </div>
        </div>
        {/* basePath, because the in-app lookup must not throw a logged-in
            member out onto the public profile route — the same asymmetry
            BusinessCard already carries for the directory. */}
        <Link
          to={`${basePath}/${business.id}`}
          state={{ from: location, label: eyebrow?.backLabel ?? "Back" }}
          className="inline-flex items-center gap-1.5 rounded-full border border-grey-300 px-3.5 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted"
        >
          View business profile <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* T0 is suppressed rather than locked: an unclaimed listing has no
          owner, so there is nobody whose details are being withheld. A lock
          would imply there is something to unlock. Each caller's own panel
          says what an unclaimed listing means. */}
      {business.verificationLevel !== UNCLAIMED && (
        <div className="mt-6">
          <ContactDetails
            business={business}
            contactLocked={business.contactLocked}
            contactLockedReason={business.contactLockedReason}
          />
        </div>
      )}
      {children}
    </div>
  );
}

export { BusinessPanel };
