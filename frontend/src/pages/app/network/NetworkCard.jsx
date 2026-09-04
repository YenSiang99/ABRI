import { Link } from "react-router-dom";
import { ArrowUpRight, Radio, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { SOURCE_NFC_SCAN } from "@/lib/connectionSources";

// The furniture the three Network pages share. Extracted here when Network
// split from one tabbed page into Requests / Connections / Following — three
// sibling routes that have to look like one section is exactly how one of
// them ends up with a different card and nobody notices for a month.
//
// Nothing in this file knows about connections or follows. It takes a
// business and whatever badges and buttons the caller wants on it, which is
// what lets a follower card (no actions at all) and a request card (two
// buttons) come out the same shape.

// `from` is the label the profile page shows on its back link, so a member
// returns to the list they actually came from rather than a generic one.
function NetworkBusinessCard({ business, badges, actions, from }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-lg font-semibold text-background">
          {business.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">{business.name}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {business.category} · {business.location}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <AppVerificationBadge verificationLevel={business.verificationLevel} />
        {badges}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to={`/app/business/${business.id}`}
                state={{ from: `/app/network/${from.path}`, label: from.label }}
              />
            }
            nativeButton={false}
          >
            Profile <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
          {actions}
        </div>
      </div>
    </div>
  );
}

// The chip every card uses. Muted by default because most of them are
// stating a fact about the relationship, not asking for anything.
function Pill({ icon: Icon, children, muted = true }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium " +
        (muted ? "text-muted-foreground" : "text-foreground")
      }
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

// How the pair met. Only connections have one — a follow has no source
// because there is only one way to make one.
function SourceBadge({ source }) {
  const tap = source === SOURCE_NFC_SCAN;
  return (
    <Pill icon={tap ? Radio : Link2} muted={false}>
      {tap ? "Card tap" : "Connected in app"}
    </Pill>
  );
}

function Grid({ children }) {
  return <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Empty({ icon: Icon, children }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center">
      {Icon && <Icon className="mx-auto h-8 w-8 text-muted-foreground" />}
      <div className="mt-3 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

// Same eyebrow on all three pages, different title under it. The eyebrow is
// what tells a member the three sidebar items are one place — without it,
// three unrelated headings read as three unrelated screens.
function PageHeader({ title, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Your network
      </div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        {title}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export { NetworkBusinessCard, Pill, SourceBadge, Grid, Empty, PageHeader };
