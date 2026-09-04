import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { fetchVouchReviews, decideVouchReview, resolveVouchFlag } from "@/lib/api/admin";
import { VouchTimeline } from "@/components/app/VouchTimeline";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";

// Human labels for VouchFlag.reason (see schema.prisma). The two content
// reasons come from the receiver's Flag action; unfair_cancel is the
// giver's, raised after the fact on an already-cancelled vouch.
const REASON_LABEL = {
  abusive_content: "Abusive / bad-faith content",
  other: "Other",
  unfair_cancel: "Unfair cancellation",
};

// Mirrors DECISIONS in backend/src/routes/admin.js. Each entry spells out
// where the vouch lands and who ends up holding it, because that — not the
// verdict on the report — is what the two businesses will actually
// experience, and it's the thing an admin should be choosing between.
const DECISIONS = {
  return_to_receiver: {
    label: "Return to receiver",
    title: "Return this to the receiver",
    body: "The report doesn't stand up. The vouch goes back to the receiver, who can accept it, send it back for edits or cancel it as normal. The 14-day timeout restarts.",
    confirm: "Return it",
    variant: "default",
    noteRequired: false,
    notePlaceholder: "Note for both businesses (optional — they'll both see this)",
  },
  send_back_to_sender: {
    label: "Send back for edits",
    title: "Send this back to the sender",
    body: "The testimonial needs changing before it goes any further. The giver must revise it, and it then returns to the receiver as a normal pending vouch.",
    confirm: "Send it back",
    variant: "default",
    noteRequired: true,
    notePlaceholder: "What has to change? (required — both businesses see this)",
  },
  cancel: {
    label: "Cancel the vouch",
    title: "Cancel this vouch",
    body: "It ends here and is never published. The giver can start a fresh attempt for this business later, same as any cancelled vouch.",
    confirm: "Cancel the vouch",
    variant: "destructive",
    noteRequired: false,
    notePlaceholder: "Note for both businesses (optional — they'll both see this)",
  },
};

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// One dialog for all three decisions rather than three near-identical ones —
// the copy is data (DECISIONS above), so the shapes can't drift apart.
function DecisionDialog({ review, decision, onOpenChange, onDone }) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Adjust state during render rather than in a useEffect — the pattern used
  // by every other dialog in this app (see components/app/VouchDialog.jsx).
  const [prevDecision, setPrevDecision] = useState(decision);
  if (decision !== prevDecision) {
    setPrevDecision(decision);
    if (decision) setNote("");
  }

  const config = decision ? DECISIONS[decision] : null;
  if (!config) return null;

  async function confirm() {
    if (config.noteRequired && !note.trim()) {
      toast.error("Add a note telling them what needs to change");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await decideVouchReview(review.id, {
        decision,
        note: note.trim() || undefined,
      });
      toast.success(`${config.label} — done`);
      onOpenChange(null);
      onDone(updated);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={Boolean(decision)} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.body}</DialogDescription>
        </DialogHeader>

        <Textarea
          rows={3}
          placeholder={config.notePlaceholder}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(null)} disabled={submitting}>
            Close
          </Button>
          <Button variant={config.variant} onClick={confirm} disabled={submitting}>
            {submitting ? "Working…" : config.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One report. Deliberately shows which revision it was filed against —
// the giver may have revised since, and judging a report against text it
// wasn't about is exactly the mistake this pins shut.
function FlagCard({ flag, onResolve, busy }) {
  // "Reviewed" alone doesn't say what was decided, and the verdict is the
  // part worth reading — it's what a later repeat-offender count reads too.
  const verdict =
    flag.status === "open"
      ? "Open"
      : flag.outcome === "upheld"
        ? "Upheld"
        : flag.outcome === "dismissed"
          ? "Dismissed"
          : "Reviewed";

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <div className="text-[13px] font-bold text-foreground">
          {REASON_LABEL[flag.reason] ?? flag.reason}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {verdict} · {formatDate(flag.createdAt)}
          {flag.resolvedBy ? ` by ${flag.resolvedBy.name}` : ""}
        </div>
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground">
        Raised by <strong>{flag.raisedBy.name}</strong> against{" "}
        <strong>{flag.against.name}</strong>
      </div>

      {flag.note && (
        <p className="mt-2 rounded-md bg-card px-3 py-2 text-[12.5px] text-foreground">{flag.note}</p>
      )}

      {flag.revisionComment && (
        <div className="mt-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Flagged text — revision {flag.revisionNumber}
          </div>
          <blockquote className="mt-1 border-l-2 border-accent pl-3 text-[12.5px] italic text-foreground">
            "{flag.revisionComment}"
          </blockquote>
        </div>
      )}

      {/* Only for reports on settled vouches. A frozen vouch's reports are
          resolved by the decision that unfreezes it — the server rejects
          resolving them here, precisely so a report can't be closed while
          the vouch it froze stays stuck. */}
      {onResolve && flag.status === "open" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onResolve(flag, "upheld")} disabled={busy}>
            Uphold
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onResolve(flag, "dismissed")} disabled={busy}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

// The whole case, on one card: who vouched for whom, the reports, and the
// complete audit trail — the same VouchTimeline both businesses see, so
// there's no admin-only version of events to reconcile against theirs.
function ReviewCard({ review, onReplace }) {
  const [decision, setDecision] = useState(null);
  const [busy, setBusy] = useState(false);

  async function resolveFlag(flag, outcome) {
    setBusy(true);
    try {
      await resolveVouchFlag(flag.id, { outcome });
      toast.success(outcome === "upheld" ? "Report upheld" : "Report dismissed");
      // Patch the one flag rather than refetching the whole queue: nothing
      // else about a settled vouch changed, and a refetch would reorder the
      // list under the admin mid-read.
      onReplace({
        ...review,
        flags: review.flags.map((f) =>
          f.id === flag.id ? { ...f, status: "reviewed", outcome } : f,
        ),
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-foreground">{review.fromBusiness?.name}</span>
        <AppVerificationBadge verificationLevel={review.fromBusiness?.verificationLevel} />
        <span className="text-muted-foreground">vouched for</span>
        <span className="font-bold text-foreground">{review.toBusiness?.name}</span>
        <AppVerificationBadge verificationLevel={review.toBusiness?.verificationLevel} />
        {review.frozen ? (
          <span className="rounded-full bg-yellow px-2 py-0.5 text-[11px] font-bold text-yellow-ink">
            On hold — waiting on you
          </span>
        ) : (
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {review.status === "cancelled" ? "Cancelled" : review.status} · tracking only
          </span>
        )}
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground">
        Attempt {review.attempt} · {review.revisionCount} of {review.maxRevisions} revision rounds
        used · last activity {formatDate(review.lastActionAt)}
      </div>

      <blockquote className="mt-4 border-l-2 border-accent pl-4 text-sm italic text-foreground">
        "{review.testimonial}"
      </blockquote>

      <div className="mt-4 flex flex-col gap-2">
        {review.flags.map((flag) => (
          <FlagCard
            key={flag.id}
            flag={flag}
            busy={busy}
            onResolve={review.frozen ? undefined : resolveFlag}
          />
        ))}
      </div>

      {/* The three exits from under_review, in the order an admin should
          consider them: hand it back first, intervene only if the text has
          to change, kill it last. */}
      {review.frozen && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button size="sm" onClick={() => setDecision("return_to_receiver")} disabled={busy}>
            {DECISIONS.return_to_receiver.label}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDecision("send_back_to_sender")}
            disabled={busy}
          >
            {DECISIONS.send_back_to_sender.label}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDecision("cancel")}
            disabled={busy}
          >
            {DECISIONS.cancel.label}
          </Button>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Full history
        </div>
        <VouchTimeline timeline={review.timeline} />
      </div>

      <DecisionDialog
        review={review}
        decision={decision}
        onOpenChange={setDecision}
        onDone={onReplace}
      />
    </div>
  );
}

function ReviewList({ reviews, empty, onReplace }) {
  if (reviews.length === 0) {
    return <p className="mt-10 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="mt-6 flex flex-col gap-3">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} onReplace={onReplace} />
      ))}
    </div>
  );
}

// The only place a vouch can leave "under_review". Every card carries the
// reports, the exact text each was filed against, and the same timeline both
// businesses see — an admin rules on the trail, not on the complaint alone.
//
// A decision replaces its card in place rather than refetching the queue: a
// card that has just been acted on stops being frozen and would otherwise
// jump between tabs (or out of the list) under the cursor of the person who
// just clicked it.
function AdminVouchReviews() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchVouchReviews()
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirrors AdminReview.jsx — ProtectedRoute + AppLayout already keep
  // non-admins out of /app/admin/*, this is the fallback.
  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-6 py-12 text-sm text-muted-foreground">Loading…</div>;
  }

  const frozen = reviews.filter((r) => r.frozen);
  const tracking = reviews.filter((r) => !r.frozen);

  const replaceReview = (updated) =>
    setReviews((current) => current.map((r) => (r.id === updated.id ? updated : r)));

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground">
        Vouch review
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        A receiver who flags a vouch freezes it: neither business can accept, edit or cancel it, and
        the 14-day timeout stops, so those sit here until you return it, send it back for edits or
        cancel it. Reports on already-cancelled vouches are tracking only — there's nothing left to
        move, so those just get a verdict.
      </p>

      <Tabs className="mt-8" defaultValue="frozen">
        <TabsList variant="line" className="border-b border-border">
          <TabsTrigger value="frozen">On hold ({frozen.length})</TabsTrigger>
          <TabsTrigger value="tracking">Reports ({tracking.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="frozen">
          <ReviewList
            reviews={frozen}
            onReplace={replaceReview}
            empty="No vouches are waiting on an admin right now."
          />
        </TabsContent>
        <TabsContent value="tracking">
          <ReviewList
            reviews={tracking}
            onReplace={replaceReview}
            empty="No open reports on settled vouches."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { AdminVouchReviews };
