import { useState } from "react";
import { Flag } from "lucide-react";

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
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { VouchDialog } from "@/components/app/VouchDialog";
import { VouchTimeline } from "@/components/app/VouchTimeline";
import { UpgradePrompt, useUpgradeGate } from "@/components/app/UpgradePrompt";
import { acceptVouch, cancelVouch, flagVouch, revertVouch } from "@/lib/api/vouches";
import {
  revisionCapFor,
  canAccept,
  canCancel,
  canFlag,
  canRevert,
  canRevise,
  isUnderReview,
} from "@/lib/vouchRules";
import { toast } from "@/lib/toast";

// Send it back to be edited. Not a rejection — the vouch stays alive and
// the giver gets the note.
function RevertDialog({ vouch, open, onOpenChange, onSuccess }) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Adjust state during render rather than in a useEffect — see
  // components/app/VouchDialog.jsx for the same pattern and its rationale.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setNote("");
  }

  async function confirm() {
    if (!note.trim()) {
      toast.error("Add a short note explaining what you'd like changed");
      return;
    }
    setSubmitting(true);
    try {
      await revertVouch(vouch.id, note.trim());
      toast.success(`Sent ${vouch.counterparty.name}'s vouch back for edits`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send back for edits</DialogTitle>
          <DialogDescription>
            They'll see your note and can revise their testimonial. Until they do, this vouch is theirs
            to act on — you won't be able to accept or cancel it in the meantime. Up to{" "}
            {revisionCapFor(vouch)} rounds per vouch.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={3} placeholder="What would you like changed?" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button onClick={confirm} disabled={submitting}>
            {submitting ? "Sending…" : "Send back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Terminal, and only that. The flag checkbox that used to live in this
// dialog is now its own action — ending a vouch and reporting the business
// that sent it are different decisions, and bundling them meant you
// couldn't report without also killing the vouch, or cancel a perfectly
// civil vouch without the reporting checkbox sitting there implying you
// should.
function CancelDialog({ vouch, open, onOpenChange, onSuccess }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setReason("");
  }

  async function confirm() {
    setSubmitting(true);
    try {
      await cancelVouch(vouch.id, reason.trim() || undefined);
      toast(`Cancelled ${vouch.counterparty.name}'s vouch`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this vouch</DialogTitle>
          <DialogDescription>
            It won't be published or count toward your vouch total, and this ends the exchange.
            They're free to try again later.
          </DialogDescription>
        </DialogHeader>

        {/* Lands on the cancel action itself, so the giver can see why when
            they look back at the trail. */}
        <Textarea
          rows={2}
          placeholder="Reason for cancelling (optional — they'll see this)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={submitting}>
            {submitting ? "Cancelling…" : "Cancel vouch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The escalation path. Distinct from cancel in what it does to the vouch:
// cancel ends it, this one freezes it — which is why the copy says so
// rather than leaving the receiver to guess whether they've also rejected
// it.
function FlagDialog({ vouch, open, onOpenChange, onSuccess }) {
  const [reason, setReason] = useState("abusive_content");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setReason("abusive_content");
      setNote("");
    }
  }

  async function confirm() {
    setSubmitting(true);
    try {
      await flagVouch(vouch.id, { reason, note: note.trim() || undefined });
      toast.success("Sent to admins for review");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flag for admin review</DialogTitle>
          <DialogDescription>
            This puts the vouch on hold and sends it to an admin with the full history. Neither of
            you can act on it — accept, edit or cancel — until they've looked at it. They'll either
            return it to you to decide, send it back for edits, or cancel it outright.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 text-sm text-foreground">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              className="mt-0.5"
              name="flag-reason"
              value="abusive_content"
              checked={reason === "abusive_content"}
              onChange={() => setReason("abusive_content")}
            />
            Abusive, misleading or bad-faith content
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              className="mt-0.5"
              name="flag-reason"
              value="other"
              checked={reason === "other"}
              onChange={() => setReason("other")}
            />
            Something else
          </label>
        </div>

        <Textarea
          rows={3}
          placeholder="Anything the admin should know (optional — they see this, the other business doesn't)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={submitting}>
            {submitting ? "Sending…" : "Flag for review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The in-flight vouch card, for BOTH sides of the negotiation — it reads
// `role`/`waitingOn` off the vouch rather than taking a direction prop, so
// giver and receiver get the same layout and the same timeline and differ
// only in which actions render.
//
// The card is always shown, even when the viewer can't do anything with it.
// Hiding it while the other party holds the turn is what made the old flow
// confusing ("did my change request go through?"); the fix is to keep the
// process visible and drop the buttons, replacing them with a line naming
// whose move it is.
function VouchRequestCard({ vouch, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  // Covers Accept and Revert, which are one decision priced together — see
  // the `acceptVouch` note in backend/src/lib/entitlements.js. Cancel and
  // Flag stay open to every plan on purpose: a member must always be able to
  // refuse a vouch or report an abusive one without paying for the privilege.
  //
  // The card itself is never gated. A Free member sees the request, the
  // testimonial, the timeline and whose turn it is — the whole thing, priced
  // only at the moment they reach for it. That is the pitch, and hiding the
  // card would be hiding the reason to upgrade.
  const reviewGate = useUpgradeGate("acceptVouch");

  const other = vouch.counterparty;
  if (!other) return null;

  const yourTurn = vouch.waitingOn === "you";
  const underReview = isUnderReview(vouch);

  async function accept() {
    setBusy(true);
    try {
      await acceptVouch(vouch.id);
      toast.success(`Accepted ${other.name}'s vouch`);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // What the viewer is waiting for, phrased from their side. Only shown
  // when it isn't their turn — otherwise the buttons say it better.
  const waitingLabel = underReview
    ? "Under admin review"
    : vouch.role === "giver"
      ? `Waiting on ${other.name} to review`
      : `Waiting on ${other.name} to revise`;

  // Same three-way split as the badge. The flagged case can't be folded
  // into the giver/receiver pair: neither "nothing to do until they review
  // it" nor "it's their move" is true when an admin has it.
  const waitingBody = underReview
    ? "An admin is reviewing this vouch — it's on hold for both of you and the 14-day timeout is paused. They'll either hand it back to be reviewed as normal, send it back for edits, or cancel it."
    : vouch.role === "receiver"
      ? "You've sent it back for edits — it's their move now. If they don't respond within 14 days this vouch closes automatically."
      : "Nothing to do until they review it.";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
          {other.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{other.name}</span>
            <AppTierBadge tier={other.tier} />
            {yourTurn ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                Your turn
              </span>
            ) : (
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {waitingLabel}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {other.category} · {vouch.role === "giver" ? "You vouched for them" : "They vouched for you"}
          </div>
        </div>

        {/* Flag lives up here rather than in the action row below, and as an
            icon rather than a labelled button, because it isn't part of the
            same decision. Accept / Revert / Cancel are the turn — one of
            them is what you came to do. Reporting the content is a rare
            escape hatch, and sitting it in the row gave it equal billing
            with the three moves that actually advance the vouch.

            Still rendered on the giver's turn (see canFlag) — abuse can't
            wait for the turn to come back around. */}
        {canFlag(vouch) && (
          <button
            type="button"
            onClick={() => setFlagOpen(true)}
            disabled={busy}
            title="Flag for admin review"
            aria-label="Flag for admin review"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          >
            <Flag className="h-4 w-4" />
          </button>
        )}
      </div>

      <blockquote className="mt-4 border-l-2 border-accent pl-4 text-sm italic text-foreground">
        "{vouch.testimonial}"
      </blockquote>

      <VouchTimeline timeline={vouch.timeline} />

      {/* Only the turn's moves. Now that Flag has moved to the header the
          row is exactly "what can I do about this vouch right now", which
          is why it can go back to gating on `yourTurn` alone. */}
      {yourTurn ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {canAccept(vouch) && (
            <Button size="sm" onClick={reviewGate.guard(accept)} disabled={busy}>
              Accept
            </Button>
          )}
          {canRevert(vouch) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={reviewGate.guard(() => setRevertOpen(true))}
              disabled={busy}
            >
              Revert
            </Button>
          )}
          {canCancel(vouch) && (
            <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)} disabled={busy}>
              Cancel
            </Button>
          )}
          {canRevise(vouch) && (
            <Button size="sm" onClick={() => setReviseOpen(true)} disabled={busy}>
              Revise
            </Button>
          )}
        </div>
      ) : null}

      {!yourTurn && <p className="mt-4 text-xs text-muted-foreground">{waitingBody}</p>}

      <CancelDialog vouch={vouch} open={cancelOpen} onOpenChange={setCancelOpen} onSuccess={onChanged} />
      <RevertDialog vouch={vouch} open={revertOpen} onOpenChange={setRevertOpen} onSuccess={onChanged} />
      <FlagDialog vouch={vouch} open={flagOpen} onOpenChange={setFlagOpen} onSuccess={onChanged} />
      <UpgradePrompt gate={reviewGate} />
      <VouchDialog
        open={reviseOpen}
        onOpenChange={setReviseOpen}
        targetBusiness={other}
        mode="revise"
        vouchId={vouch.id}
        initialTestimonial={vouch.testimonial}
        onSuccess={onChanged}
      />
    </div>
  );
}

export { VouchRequestCard };
