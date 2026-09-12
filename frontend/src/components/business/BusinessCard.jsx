import { Link } from "react-router-dom";
import { ArrowUpRight, Clock } from "lucide-react";

import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { Button } from "@/components/ui/button";
import { CLAIMED } from "@/lib/verificationLevels";

// `connectionState` is the four-state answer from connectionStateWith in
// ConnectionsContext, not a boolean. A connection has had a middle since
// Aug 2026 — you asked and they haven't answered — and a card that can only
// say "Connect" or "Connected" has nowhere to put it. It would go on
// rendering "Connect" over an outstanding request, which reads as though
// the press did nothing.
function BusinessCard({
  business,
  basePath = "/business",
  connectable = false,
  connectionState = "none",
  // Connecting is a round trip to the server, so the button has to say so —
  // otherwise a card sits looking untouched until the response lands, and
  // an impatient second click fires a second request.
  connecting = false,
  onConnect,
  showActions = false,
  // Keeps the top-right corner clear for a control the CALLER positions over
  // this card — the directory's watch button. It cannot be passed in as a
  // child, because this whole card is a <Link> and a button inside an anchor
  // both navigates and fires; so the caller overlays it absolutely and uses
  // this to stop the business name running underneath.
  //
  // Padding on the header row only, not the card: the actions row at the
  // bottom is nowhere near the corner and should keep its full width.
  //
  // pr-6 is measured, not guessed. The card's own padding is p-6 (24px) and
  // the overlaid button sits at right-3 (12px) with size-8 (32px), so it
  // reaches 44px in from the card edge and intrudes 20px past the content
  // box. 24px clears it with 4px to spare. A larger value is not safer, it
  // just spends the business name's width — these cards are three-up on a
  // wide screen and the name truncates early enough already.
  reserveTopRight = false,
}) {
  return (
    <Link
      to={`${basePath}/${business.id}`}
      // h-full AND flex-col together, and neither is decoration.
      //
      // h-full: a grid row stretches its ITEMS, and in the app directory the
      // item is a wrapper <div> (it has to be — the watch button is positioned
      // against it), so the stretch stopped at the wrapper and every card in a
      // row ended at its own content height. A card whose location wrapped to
      // two lines stood taller than its neighbours and the row looked ragged.
      //
      // flex-col + mt-auto on the actions: once the cards are equal height,
      // the shorter ones have slack, and slack has to go somewhere. Without
      // this it lands under the buttons and they float mid-card; with it the
      // buttons sit on the bottom edge and line up across the row.
      className="flex h-full flex-col rounded-lg border border-grey-200 bg-white p-6 transition-shadow hover:shadow-md dark:border-border dark:bg-card"
    >
      <div
        className={`flex items-start gap-4${reserveTopRight ? " pr-6" : ""}`}
      >
        <div className="grid size-12 flex-none place-items-center rounded-xl bg-ink text-lg font-extrabold text-yellow dark:bg-grey-700">
          {business.name.charAt(0)}
        </div>
        <div className="min-w-0">
          {/* TWO LINES, NOT ONE ELLIPSIS. `truncate` cut most real names in
              half at three-up ("Bangsar Legal Pa…"), which is the one string
              on this card a reader is actually scanning for. line-clamp-2
              gives it a second line and only then gives up, which fits every
              name in the seed data; break-words keeps a single long token
              (a domain-style name) inside the box rather than widening it.

              leading-tight because two lines at the default leading pushed
              the badge down enough to change the card's rhythm. */}
          <div className="line-clamp-2 text-[17px] leading-tight font-extrabold break-words text-ink dark:text-foreground">
            {business.name}
          </div>
          <div className="mt-[3px] text-[13.5px] text-grey-600 dark:text-muted-foreground">
            {business.category} · {business.location}
          </div>
          <div className="mt-2.5">
            <VerificationBadge
              verificationLevel={business.verificationLevel}
              size="inline"
              chip
            />
          </div>
        </div>
      </div>
      {/* FOUR states, four strings, and the order matters.
          
          "Log in to see vouches" is checked on the KEY BEING ABSENT, not on a
          zero: GET /businesses withholds vouchCount from an anonymous caller
          rather than zeroing it, precisely so this line can tell "we're not
          telling you" from "the answer is none". Collapsing them would show
          "No vouches yet" about a business with forty, which is a lie told to
          exactly the reader we are trying to convince to sign up.
          
          The verification line comes first because an L1 business has no
          vouches to withhold — telling a stranger to log in for a number that
          does not exist spends the one action we asked of them and teaches
          them the prompt lies. Same precedence contactVisibility uses when it
          reports owner_plan ahead of viewer_anonymous. */}
      <div className="mt-4 text-[13px] text-grey-500 dark:text-muted-foreground">
        {business.verificationLevel === CLAIMED
          ? "Vouches unlock after SSM verification"
          : business.vouchCount === undefined
            ? "Log in to see vouches"
            : business.vouchCount > 0
              ? `${business.vouchCount} vouches`
              : "No vouches yet"}
      </div>
      {showActions && (
        <div className="mt-auto flex gap-2 pt-4">
          <Button size="sm" variant="outline">
            View Profile <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
          {connectable &&
            (connectionState === "connected" ? (
              <Button size="sm" variant="secondary" disabled>
                Connected
              </Button>
            ) : connectionState === "requested" ? (
              // Inert here, unlike the same state on the profile page, which
              // offers Withdraw. This is a browsing grid: withdrawing is
              // silent (the other side is never told a request existed), so
              // a mis-click among a dozen cards would undo something the
              // member couldn't see had happened. Withdraw lives on the
              // profile and in Network → Requests, both of which are places
              // you go on purpose.
              <Button size="sm" variant="secondary" disabled>
                <Clock className="h-3.5 w-3.5" /> Requested
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={connecting}
                onClick={(e) => {
                  // The whole card is a <Link>; without these a connect also
                  // navigates to the profile.
                  e.preventDefault();
                  e.stopPropagation();
                  onConnect(business);
                }}
              >
                {/* "Accept" when they asked first. The click does the same
                    thing either way — POST /connections accepts a request
                    already addressed to you — but calling that "Connect"
                    hides that somebody is waiting on this member. */}
                {connecting
                  ? connectionState === "incoming"
                    ? "Accepting…"
                    : "Sending…"
                  : connectionState === "incoming"
                    ? "Accept request"
                    : "Connect"}
              </Button>
            ))}
        </div>
      )}
    </Link>
  );
}

export { BusinessCard };
