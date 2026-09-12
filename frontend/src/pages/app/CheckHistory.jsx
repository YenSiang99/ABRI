import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, AlertTriangle, Bell, Eye, EyeOff, Lock } from "lucide-react";

import { LockedFeature } from "@/components/app/LockedFeature";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { WatchButton } from "@/components/business/WatchButton";
import { useAuth } from "@/context/AuthContext";
import {
  fetchChecks,
  fetchWatches,
  fetchProfileViewers,
  setPrivateBrowsing,
} from "@/lib/api/watches";
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
// TWO DIRECTIONS OF ONE RELATION, which is why they are tabs on one screen
// rather than two entries in the sidebar. "Who did I look at" and "who looked
// at me" are the same question asked from either end, and a member who reads
// one immediately wants the other.
//
// THEY ARE NOT THE SAME DATA. The Checked tab reads BusinessCheck, which is
// the member's own log and still cannot be turned around — no route takes a
// target id, and a business cannot learn that it was checked. The Viewers tab
// reads ProfileView, a separate table written for that purpose (Sep 2026).
// The argument against ever showing it is preserved in
// backend/src/lib/businessCheck.js: it was outweighed, not refuted, and it is
// the reason the two tables must not be merged.
//
// THE VIEWERS TAB IS NOT PLAN-SHUT. Every plan sees the counts; Pro sees the
// names. That asymmetry is the feature — see the panel below.

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
          <AppVerificationBadge
            verificationLevel={entry.business.verificationLevel}
          />
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
                {verificationLevelLabel[entry.levelAtCheck] ??
                  entry.levelAtCheck}
              </span>{" "}
              when you checked.
            </span>
          </p>
        )}
      </div>

      <WatchButton
        business={entry.business}
        watching={watching}
        onChanged={onWatchChanged}
      />
    </li>
  );
}

// One business that opened your profile. Deliberately NOT the Row above: a
// check is something you did and carries a WatchButton to act on, while a view
// is something that happened to you and has no action attached. Sharing a
// component would mean a prop that blanks half of it, which is how one row
// grows two meanings.
function ViewerRow({ entry }) {
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
          <AppVerificationBadge
            verificationLevel={entry.business.verificationLevel}
          />
          <span className="text-xs text-muted-foreground">
            {new Date(entry.lastViewedAt).toLocaleDateString()}
          </span>
          {/* Only past the first. "Viewed once" is the default case and saying
              it on every row would bury the repeat visitor, who is the only
              genuinely actionable entry on this screen. */}
          {entry.viewCount > 1 && (
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {entry.viewCount}×
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

// "7 businesses viewed your profile" — the sentence every plan gets.
//
// Written as a function rather than a template because the singular is the
// case that matters: a member with exactly one viewer is the one most likely
// to be reading this screen for the first time, and "1 businesses" on that
// screen is the sort of thing that makes a product feel unfinished.
function viewerHeadline(count, windowDays) {
  if (count === 0)
    return `No one has opened your profile in the last ${windowDays} days.`;
  if (count === 1) return "Someone viewed your profile.";
  return `${count} businesses viewed your profile.`;
}

// The toggle, and the sentence that has to sit next to it.
//
// THE COST IS STATED ON THE CONTROL ITSELF, not in a tooltip and not after the
// fact. A member who turns this on and then finds their own viewer list gone
// has been surprised by their own setting, which reads as a bug rather than a
// trade — and a trade nobody understood they were making is not consent.
function PrivateBrowsingToggle({ value, onChange, busy }) {
  return (
    <div className="mt-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border p-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {value ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">
            Browse privately
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {value
            ? "Businesses you open aren't told it was you. While this is on, you can't see who viewed you either."
            : "Businesses you open can see your name on their viewers list."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={busy}
        onClick={() => onChange(!value)}
        className={
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 " +
          (value ? "bg-foreground" : "bg-secondary")
        }
      >
        {/* POSITIONED WITH `left`, NOT `translate`. The first version used
            translate-x-* and no left, which left the span at its STATIC
            position (22px into a 44px track) and then translated 24px on top
            of it — putting the knob 46px in, just past the end of its own
            track, where it read as a plain white pill with no knob at all.
            An absolutely positioned element with no inset is only as
            predictable as the layout it happens to fall out of. */}
        <span
          className={
            "absolute top-1 h-4 w-4 rounded-full bg-background transition-all " +
            (value ? "left-6" : "left-1")
          }
        />
      </button>
    </div>
  );
}

// The inbound half. NEVER plan-shut — see the file header.
function ViewersPanel() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);

  function load() {
    return fetchProfileViewers()
      .then((body) => {
        setData(body);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    let live = true;
    fetchProfileViewers()
      .then((body) => {
        if (!live) return;
        setData(body);
        setStatus("ready");
      })
      .catch(() => live && setStatus("error"));
    return () => {
      live = false;
    };
  }, []);

  // Refetched rather than patched in place: flipping the toggle changes
  // `identitiesLocked` and the whole `viewers` array on the server, and
  // reconstructing that here would be a second implementation of the
  // reciprocity rule that could disagree with the first.
  async function toggle(next) {
    setBusy(true);
    try {
      await setPrivateBrowsing(next);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading")
    return <p className="mt-8 text-sm text-muted-foreground">Loading…</p>;
  if (status === "error") {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        Couldn&rsquo;t load your viewers.
      </p>
    );
  }

  const lockedForUpgrade =
    data.identitiesLocked && data.lockedReason !== "private_browsing";
  const lockedByChoice =
    data.identitiesLocked && data.lockedReason === "private_browsing";

  return (
    <>
      <div className="mt-8 rounded-2xl border border-border bg-card/50 p-6">
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">
              {viewerHeadline(data.viewerCount, data.windowDays)}
            </p>
            {/* The second number, and only when it adds something. Equal
                counts mean every viewer came once, which the headline has
                already said. */}
            {data.viewCount > data.viewerCount && (
              <p className="mt-1 text-sm text-muted-foreground">
                {data.viewCount} views in the last {data.windowDays} days.
              </p>
            )}
            {/* Said out loud, because the alternative is a Pro member counting
                a shorter list than their own headline and concluding the
                product lost some. */}
            {!data.identitiesLocked && data.anonymousCount > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {data.anonymousCount === 1
                  ? "One of them is browsing privately and isn't named."
                  : `${data.anonymousCount} of them are browsing privately and aren't named.`}
              </p>
            )}
          </div>
        </div>
      </div>

      <PrivateBrowsingToggle
        value={data.privateBrowsing}
        onChange={toggle}
        busy={busy}
      />

      {/* Their own setting, not a price. No upsell and no tier chip: there is
          nothing to buy here, and pitching Pro at a member who already has it
          — or who could have their list back for free by flipping the switch
          above — is the product selling something it already gave them. */}
      {lockedByChoice && (
        <p className="mt-4 inline-flex items-start gap-1.5 text-sm text-muted-foreground">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You&rsquo;re browsing privately, so names are hidden both ways. Turn
            it off above to see who viewed you.
          </span>
        </p>
      )}

      {/* The paid half. Shown as a priced door rather than an absence: the
          member already knows the number, so hiding the panel entirely would
          leave them with a fact and no way to act on it. */}
      {lockedForUpgrade && data.viewerCount > 0 && (
        <div className="mt-4">
          <LockedFeature
            requiredMembershipTier={data.requiredMembershipTier ?? "pro"}
            title="See who they were"
            description="Pro shows you the name, category and standing of every business that opened your profile — and which of them came back."
          />
        </div>
      )}

      {/* Locked AND nobody has looked. No upsell: selling the names of an
          empty list is selling nothing, and a padlock on a screen with no
          news reads as the product withholding rather than offering. */}
      {lockedForUpgrade && data.viewerCount === 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Pro shows you who they were, once someone visits.
        </p>
      )}

      {!data.identitiesLocked && data.viewers?.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {data.viewers.map((entry) => (
            <ViewerRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={
        "border-b-2 px-1 pb-3 text-sm font-semibold transition-colors " +
        (active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function CheckHistory() {
  const { business } = useAuth();
  const [tab, setTab] = useState("checked");
  const [checks, setChecks] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [status, setStatus] = useState("loading");

  const allowed = membershipTierAllows(
    business?.membershipTier,
    "checkHistory",
  );

  async function load() {
    try {
      const [rows, watches] = await Promise.all([
        fetchChecks(),
        fetchWatches(),
      ]);
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Your record
      </div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        Checks &amp; viewers
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Who you looked at, and who looked at you.
      </p>

      {/* THE PAGE IS NO LONGER ONE FEATURE, so the lock is no longer the whole
          page. It used to return LockedFeature before rendering anything,
          which would now hide the viewers panel — the half a Free member is
          entitled to — behind a padlock for the plan that most needs to see
          it. The lock moved inside the Checked tab. */}
      <div role="tablist" className="mt-8 flex gap-6 border-b border-border">
        <TabButton active={tab === "checked"} onClick={() => setTab("checked")}>
          You checked
        </TabButton>
        <TabButton active={tab === "viewers"} onClick={() => setTab("viewers")}>
          Viewed you
        </TabButton>
      </div>

      {tab === "viewers" && <ViewersPanel />}

      {tab === "checked" && !allowed && (
        <div className="mt-8">
          <LockedFeature
            requiredMembershipTier="pro"
            title="Check history"
            description="Every business you've checked, and what their standing was at the time — so you can show what you knew when you decided."
          />
        </div>
      )}

      {tab === "checked" && allowed && (
        <>
          <p className="mt-6 max-w-xl text-sm text-muted-foreground">
            What you checked, and what you were told at the time. Nobody can see
            that you checked them — this list is yours alone.
          </p>

          {status === "loading" && (
            <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
          )}
          {status === "error" && (
            <p className="mt-8 text-sm text-muted-foreground">
              Couldn&rsquo;t load your history.
            </p>
          )}

          {status === "ready" && checks.length === 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
              <History className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-3 text-sm text-muted-foreground">
                Nothing yet. Businesses appear here as you open them from the{" "}
                <Link
                  to="/app/directory"
                  className="underline underline-offset-4"
                >
                  directory
                </Link>
                .
                {/* Said plainly, because it is the honest limit of the feature:
                    the log starts when the plan does. Collecting a Free member's
                    searches in order to sell them the history later would be
                    manufacturing the need for it. */}
                <span className="mt-2 block text-xs">
                  Your history starts from when Pro did — we don&rsquo;t keep a
                  log before that.
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
        </>
      )}
    </div>
  );
}

export { CheckHistory };
