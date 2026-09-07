import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ShieldQuestion } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BusinessPanel } from "@/components/business/BusinessPanel";
import { InviteToClaim, NoRecordPanel } from "@/components/business/InviteToClaim";
import { NetworkOverlap } from "@/components/business/NetworkOverlap";
import { WatchButton } from "@/components/business/WatchButton";
import { VerificationBadge, VERIFICATION_LEVEL_SUBTITLE } from "@/components/badge/VerificationBadge";
import { ExplainBadge } from "@/components/badge/BadgeExplainer";
import { useAuth } from "@/context/AuthContext";
import { lookupBusinesses } from "@/lib/api/businesses";
import { fetchWatches } from "@/lib/api/watches";
import { verificationLevelLabel } from "@/lib/trustLabels";

// Check a business — paste a name, a registration number or a website and
// find out what ABRI knows about them.
//
// ══ THE ONE RULE ══════════════════════════════════════════════════════════
//
// ABRI HAS NO SSM REGISTRY ACCESS. Every answer on this screen is a statement
// about ABRI's own membership and NOTHING ELSE. "No record" means we have not
// heard of them; it does not mean unregistered, it does not mean fraudulent,
// and it must never be rendered as a warning. No red, no crosses, no
// triangles, no risk score.
//
// The blueprint's founding principle #8 is "lead with credibility and status,
// never fear", and its line for this exact screen is: honest flag, "Not yet
// verified ON ABRI", action = invite to verify. That is why this page is
// called "Check a business" and never "scam check" — and why the miss state
// below spends a whole sentence saying what the answer does not mean.
//
// At current membership a miss is the COMMON answer, not the edge case. The
// invite is the main path through this screen, not a consolation.
// ══════════════════════════════════════════════════════════════════════════
//
// PUBLIC ONLY. The invite this screen produces is an unsolicited message with
// a link in it — the shape of a scam — so a trust network whose invite cannot
// be checked without joining first is self-defeating. The recipient has to be
// able to look up the sender.
//
// There was an /app/check twin. It is gone: once /app/directory learned to
// match registration numbers and domains and to say why a row matched, a
// logged-in member had two search boxes and no way to tell which to use. The
// in-app answer is the directory; this is the door for everyone else.

const EYEBROW = { label: "Lookup result", icon: ShieldQuestion, backLabel: "Back to your search" };

// What the reader is being told, per `standing` from the server. Kept as
// whole sentences rather than assembled from fragments, because each one is
// making a different and carefully bounded claim.
const STANDING_COPY = {
  listed: {
    title: "This business is on ABRI.",
    body: "Their verification level is shown above. Anything beyond it — whether they are a good counterparty — is your call, not ours.",
  },
  unclaimed: {
    title: "We hold a listing, but nobody has claimed it.",
    body: "No owner has proved they run this business, so nothing here has been checked. It is a name in the directory and no more than that.",
  },
};

// Why this row came back. Shown because "the registration number you pasted
// matched" and "the name contains what you typed" are very different degrees
// of confidence, and presenting both identically is how a loose name match
// gets read as confirmation.
const MATCH_COPY = {
  ssm: "Matched on registration number",
  domain: "Matched on website or email domain",
  name: "Matched on name — check it is the right one",
};

// Public-only now. The `inApp` variant was deleted when /app/directory learned
// to match registration numbers and domains: a logged-in member with two
// search boxes had no way to know which one to use, and this was the one with
// nothing of its own left.
function ResultPanel({ business, watchedIds, onWatchChanged, isAuthenticated }) {
  const copy = STANDING_COPY[business.standing] ?? STANDING_COPY.unclaimed;

  return (
    <BusinessPanel business={business} eyebrow={EYEBROW} basePath="/business">
      <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
        <p className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
          {MATCH_COPY[business.matchReason] ?? MATCH_COPY.name}
        </p>
        <p className="mt-2 text-sm font-bold text-ink dark:text-foreground">{copy.title}</p>
        <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">{copy.body}</p>

        <p className="mt-4 text-[13.5px] text-grey-600 dark:text-muted-foreground">
          <span className="font-semibold text-ink dark:text-foreground">
            {verificationLevelLabel[business.verificationLevel]}
          </span>{" "}
          — {VERIFICATION_LEVEL_SUBTITLE[business.verificationLevel]}.{" "}
          {business.vouchCount > 0
            ? `${business.vouchCount} ${business.vouchCount === 1 ? "member has" : "members have"} vouched for them.`
            : "No member has vouched for them yet."}
        </p>

        {/* An unclaimed listing is the one hit that still wants an invite:
            there is a page waiting for them and a claim link that already
            works. /register?business=<id> is wired and used by
            BusinessProfile and CardTap. */}
        {/* Both paths, because the reader might be either party: the owner
            who just found their own unclaimed listing, or somebody who deals
            with them. Until this was shared with the directory it offered
            only the second. */}
        {business.standing === "unclaimed" && (
          <InviteToClaim name={business.name} businessId={business.id} />
        )}

        {/* Plus. Renders nothing when there is no overlap or the viewer is
            below Plus — see NetworkOverlap on why the same silence serves
            both. */}
        <NetworkOverlap vouchers={business.vouchersInYourNetwork} />

        {/* Pro, and offered on an UNCLAIMED listing too — the one case
            Follow refuses and the best reason this exists. Hidden from
            logged-out visitors: there is no session to attach a watch to,
            and the page already asks them to log in. */}
        {isAuthenticated && (
          <div className="mt-4">
            <WatchButton
              business={business}
              watching={watchedIds.has(business.id)}
              onChanged={onWatchChanged}
            />
          </div>
        )}
      </div>
    </BusinessPanel>
  );
}

function CheckBusiness() {
  const { isAuthenticated } = useAuth();
  const [params, setParams] = useSearchParams();
  // Which businesses this member already watches, so a result can render
  // "Watching" rather than "Watch". Fetched once and refreshed on change;
  // below Pro the request 402s and the set stays empty, which renders the
  // unwatched state — correct, because they have none.
  const [watchedIds, setWatchedIds] = useState(new Set());
  const refreshWatches = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const rows = await fetchWatches();
      setWatchedIds(new Set(rows.map((w) => w.business.id)));
    } catch {
      setWatchedIds(new Set());
    }
  }, [isAuthenticated]);
  useEffect(() => {
    refreshWatches();
  }, [refreshWatches]);
  // The query lives in the URL so a result can be linked, kept and re-opened —
  // which is the whole point of a screen somebody consults before acting.
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");

  // 300ms debounce, the same shape Directory.jsx uses. The `cancelled` flag is
  // what stops a slow early response landing after a fast later one and
  // showing an answer to a question the member has finished changing.
  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed.length < 2) {
      setResult(null);
      setStatus("idle");
      return undefined;
    }
    let cancelled = false;
    setStatus("loading");
    const timer = setTimeout(() => {
      lookupBusinesses(trimmed)
        .then((data) => {
          if (cancelled) return;
          setResult(data);
          setStatus("ready");
          setParams(trimmed ? { q: trimmed } : {}, { replace: true });
        })
        .catch((err) => {
          if (cancelled) return;
          // A real failure — offline, or the rate limiter. Distinct from a
          // miss, which arrives as a 200 with an empty list and must never
          // render as an error.
          setStatus("error");
          setResult({ error: err.message });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, setParams]);

  return (
    <div className="mx-auto max-w-[720px] px-6 py-16">
      <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
        Check a business
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink dark:text-foreground md:text-4xl">
        Who are you dealing with?
      </h1>
      <p className="mt-3 max-w-xl text-sm text-grey-600 dark:text-muted-foreground">
        Paste a company name, SSM registration number, or their website. We&rsquo;ll tell you what
        ABRI knows about them — and what it doesn&rsquo;t.
      </p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-500 dark:text-muted-foreground" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="XYZ Enterprise Sdn Bhd, 202301234567, or xyz.com.my"
          aria-label="Company name, registration number or website"
          className="pl-10"
        />
      </div>

      {status === "loading" && (
        <p className="mt-6 text-sm text-grey-600 dark:text-muted-foreground">Checking…</p>
      )}

      {status === "error" && (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{result?.error}</p>
      )}

      {status === "ready" && result?.matches?.length === 0 && <NoRecordPanel query={result.query} />}

      {status === "ready" &&
        result?.matches?.map((business) => (
          <ResultPanel
            key={business.id}
            business={business}
            watchedIds={watchedIds}
            onWatchChanged={refreshWatches}
            isAuthenticated={isAuthenticated}
          />
        ))}

      {status === "ready" && result?.matches?.length > 0 && (
        <p className="mt-6 text-xs text-grey-500 dark:text-muted-foreground">
          Showing what ABRI holds. A verification level says a document was checked — it is not a
          recommendation, and it never speaks to how they will treat you.{" "}
          <ExplainBadge axis="verification" business={result.matches[0]}>
            <span className="cursor-pointer underline underline-offset-2">
              What do these levels mean?
            </span>
          </ExplainBadge>
        </p>
      )}

      {/* Keyed on the SESSION, not on the route. The public page is reachable
          by a logged-in member (the nav links to it from every page), and
          telling somebody who is already signed in to sign in is the kind of
          prompt that teaches readers to ignore prompts. */}
      {!isAuthenticated && status === "ready" && (
        <p className="mt-8 text-sm text-grey-600 dark:text-muted-foreground">
          <Link to="/login" className="font-bold text-ink underline-offset-4 hover:underline dark:text-foreground">
            Log in
          </Link>{" "}
          to see contact details and vouch for businesses you know.
        </p>
      )}
    </div>
  );
}

export { CheckBusiness };
