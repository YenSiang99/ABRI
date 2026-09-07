import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, AlertTriangle, Bell } from "lucide-react";

import { LockedFeature } from "@/components/app/LockedFeature";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { WatchButton } from "@/components/business/WatchButton";
import { useAuth } from "@/context/AuthContext";
import { fetchChecks, fetchWatches } from "@/lib/api/watches";
import { membershipTierAllows } from "@/lib/membershipTiers";
import { verificationLevelLabel } from "@/lib/trustLabels";

// Pro. What this member checked, and what they were told at the time.
//
// WHY THE STORED LEVEL MATTERS. This is a record of what you knew when you
// made a decision, so it reads the level AS IT STOOD, not as it is now. A log
// that joined the level live would rewrite its own history every time a
// business changed — which is exactly the property that would make it
// worthless as evidence. The two are shown side by side, and a difference is
// flagged, because "verified when I paid them, not verified now" is the
// single most useful thing this screen can tell anybody.
//
// IT CANNOT BE TURNED AROUND. There is no version of this that shows who has
// been checking YOU. That question is what turns a trust directory into
// surveillance: a business that could see it was being looked into would
// learn something about a counterparty's private diligence, and members would
// stop checking anyone they might have to face. The route takes no target id
// — see the BusinessCheck model in schema.prisma.

function Row({ entry, watching, onWatchChanged }) {
  return (
    <li className="flex flex-wrap items-start gap-4 py-5">
      <div className="min-w-0 flex-1">
        <Link
          to={`/app/business/${entry.business.id}`}
          className="text-base font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {entry.business.name}
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          {entry.business.category} · {entry.business.location}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AppVerificationBadge verificationLevel={entry.business.verificationLevel} />
          <span className="text-xs text-muted-foreground">
            Checked {new Date(entry.checkedAt).toLocaleDateString()}
          </span>
        </div>

        {/* The reason the level is stored rather than joined. Shown only when
            it differs — an unchanged record needs no commentary, and a line
            on every row would bury the one that matters. */}
        {entry.levelChanged && (
          <p className="mt-2 inline-flex items-start gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              They were{" "}
              <span className="font-semibold">
                {verificationLevelLabel[entry.levelAtCheck] ?? entry.levelAtCheck}
              </span>{" "}
              when you checked.
            </span>
          </p>
        )}
      </div>

      <WatchButton business={entry.business} watching={watching} onChanged={onWatchChanged} />
    </li>
  );
}

function CheckHistory() {
  const { business } = useAuth();
  const [checks, setChecks] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [status, setStatus] = useState("loading");

  const allowed = membershipTierAllows(business?.membershipTier, "checkHistory");

  async function load() {
    try {
      const [rows, watches] = await Promise.all([fetchChecks(), fetchWatches()]);
      setChecks(rows);
      setWatchedIds(new Set(watches.map((w) => w.business.id)));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  // The whole page is the feature, so the whole page is the lock — unlike a
  // gated BUTTON, which stays visible and priced on click. Nothing here would
  // render for a member without history, so a stub would be a blank screen
  // with a price on it.
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <LockedFeature
          requiredMembershipTier="pro"
          title="Check history"
          description="Every business you've checked, and what their standing was at the time — so you can show what you knew when you decided."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Your record
      </div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        Check history
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        What you checked, and what you were told at the time. Nobody can see that you checked
        them — this list is yours alone.
      </p>

      {status === "loading" && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
      {status === "error" && (
        <p className="mt-8 text-sm text-muted-foreground">Couldn&rsquo;t load your history.</p>
      )}

      {status === "ready" && checks.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 text-sm text-muted-foreground">
            Nothing yet. Businesses appear here as you check them from the{" "}
            <Link to="/app/directory" className="underline underline-offset-4">
              directory
            </Link>
            .
            {/* Said plainly, because it is the honest limit of the feature:
                the log starts when the plan does. Collecting a Free member's
                searches in order to sell them the history later would be
                manufacturing the need for it. */}
            <span className="mt-2 block text-xs">
              Your history starts from when Pro did — we don&rsquo;t keep a log before that.
            </span>
          </div>
        </div>
      )}

      {status === "ready" && checks.length > 0 && (
        <>
          <p className="mt-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            Watch any of them to be told if their verification changes.
          </p>
          <ul className="divide-y divide-border">
            {checks.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                watching={watchedIds.has(entry.business.id)}
                onWatchChanged={load}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export { CheckHistory };
