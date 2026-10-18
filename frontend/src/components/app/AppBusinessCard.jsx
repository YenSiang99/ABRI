import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { EndorsementBadge } from "@/components/badge/EndorsementBadge";

// The dashboard's "Businesses to endorse" card.
//
// FIXED SEP 2026, and both halves were broken in the same way — the component
// was written against the deleted localStorage mock (frontend/src/lib/store/*)
// and never re-pointed at the API when that went:
//
//   business.industry / business.corridor  — the mock's names for what the
//       API calls category / location. Both were undefined, so every card
//       rendered the line "undefined · undefined".
//   business.endorsementsReceived               — the API sends endorsementCount. Every
//       card read "undefined endorsements".
//   the Endorsement button                       — fired `toast.success("Endorsed
//       for X")` and nothing else. No dialog, no gate, no request. It told
//       members they had endorsed somebody when nothing had happened.
//
// That last one is why this is a bug rather than a cosmetic tidy: a toast
// saying an endorsement was given, on a product whose entire asset is that its
// claims are checked.
//
// The button now does what every other endorsement affordance does — opens the real
// dialog through useUpgradeGate — and the OWNER of that dialog is the page,
// not this card. Same arrangement pages/app/feed/Feed.jsx uses: one dialog
// re-pointed per card, rather than one per card in a grid.
function AppBusinessCard({ business, onEndorse }) {
  const initial = business.name.charAt(0);

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-lg font-semibold text-background">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/app/business/${business.id}`}
            className="truncate text-base font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {business.name}
          </Link>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {[business.category, business.location].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <AppVerificationBadge verificationLevel={business.verificationLevel} />
        <EndorsementBadge endorsementLevel={business.endorsementLevel} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        {/* endorsementCount is ABSENT for a logged-out caller — GET /businesses
            withholds it rather than zeroing it, so BusinessCard can tell "not
            telling you" from "none". This card only renders for a logged-in
            member, so the fallback is defensive rather than load-bearing. */}
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{business.endorsementCount ?? 0}</span>{" "}
          {business.endorsementCount === 1 ? "endorsement" : "endorsements"}
        </span>
        <Button size="sm" variant="secondary" onClick={() => onEndorse?.(business)}>
          Endorse
        </Button>
      </div>
    </div>
  );
}

export { AppBusinessCard };
