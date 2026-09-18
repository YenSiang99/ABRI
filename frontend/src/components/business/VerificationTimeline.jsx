import { verificationLevelLabel } from "@/lib/trustLabels";

// SHARED BY BOTH PROFILES, the same way PortfolioList is, and for the same
// reason: the owner's page promises "this is what visitors see", and a second
// copy of this panel is a second place for that promise to stop being true.
//
// The owner reads it for a different reason than a visitor does — not "can I
// trust them" but "what does my own record say" — and that difference is
// deliberately NOT expressed as a different component. An owner who is shown a
// tidier version of their own history than a counterparty gets is an owner who
// will be surprised by a conversation they cannot see coming.

// The verification record — what a registry said about this business, and when.
//
// THE ONE PANEL HERE THAT CAN SAY SOMETHING UNFLATTERING, and that is the
// point of it. Every other surface on this page shows what is currently true:
// the badge, the vouch count. A counterparty deciding
// whether to trust this business with work needs the other half — that the
// SSM verification they can see today was granted in April, or that one they
// cannot see was lost in August. No other directory will print that.
//
// FACTS AND DATES, NO SCORE. Each row is an event on a day. There is no
// aggregate and no rating: a dated fact is defensible, a number is an opinion
// somebody will eventually dispute.
//
// Public to everyone including logged-out visitors, on every plan — see the
// note on the server side in routes/businesses.js. Charging to find out that
// a verification lapsed would invert the entire product.
const TIMELINE_COPY = {
  business_claimed: "Claimed by its owner",
  business_verified: "SSM-verified",
  business_verification_revoked: "SSM verification revoked",
};

function VerificationTimeline({ entries }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
      <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">
        Verification record
      </h2>
      <p className="mt-1 text-sm text-grey-500 dark:text-muted-foreground">
        What changed, and when. Including anything that was later withdrawn.
      </p>
      <ol className="mt-4 space-y-3">
        {entries.map((entry) => {
          const revoked = entry.type === "business_verification_revoked";
          const lapsed = !entry.inForce;
          return (
            <li key={entry.id} className="flex gap-3 text-sm">
              {/* Date first and in mono, because this panel is read as a
                  record rather than prose — the eye should land on when. */}
              <span className="w-24 shrink-0 font-mono text-xs text-grey-500 dark:text-muted-foreground">
                {new Date(entry.at).toLocaleDateString()}
              </span>
              <span className="min-w-0">
                <span
                  className={
                    lapsed
                      ? "text-grey-500 line-through dark:text-muted-foreground"
                      : "text-ink dark:text-foreground"
                  }
                >
                  {TIMELINE_COPY[entry.type] ?? entry.type}
                </span>
                {/* Struck through AND labelled. The strike alone reads as a
                    style; the words are what a reader takes away, and this is
                    the line the whole panel exists to show. */}
                {lapsed && (
                  <span className="ml-2 text-xs text-grey-500 dark:text-muted-foreground">
                    no longer in force
                  </span>
                )}
                {revoked && (
                  <span className="ml-2 text-xs text-grey-500 dark:text-muted-foreground">
                    dropped to{" "}
                    {verificationLevelLabel[entry.level] ?? entry.level}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export { VerificationTimeline, TIMELINE_COPY };
