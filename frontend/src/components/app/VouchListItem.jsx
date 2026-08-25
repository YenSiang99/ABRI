import { useState } from "react";

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
import { useAuth } from "@/context/AuthContext";
import { existingVouchTo } from "@/lib/vouchRules";
import { flagUnfairCancel } from "@/lib/api/vouches";
import { toast } from "@/lib/toast";

function FlagCancelDialog({ vouch, other, open, onOpenChange, onSuccess }) {
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
    setSubmitting(true);
    try {
      await flagUnfairCancel(vouch.id, note.trim() || undefined);
      toast.success("Flagged for admin review");
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
          <DialogTitle>Flag this cancellation</DialogTitle>
          <DialogDescription>
            Visible to admins only. This won't reopen or republish the vouch — it's a signal admins use
            to spot businesses that cancel in bad faith repeatedly.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          placeholder={`Why do you think ${other.name}'s cancellation was unfair? (optional)`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={submitting}>
            {submitting ? "Flagging…" : "Flag for review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The SETTLED-vouch card — published or closed, never in-flight. Anything
// still being negotiated is rendered by VouchRequestCard instead, which is
// where the turn logic and the accept/revise actions live. Keeping the two
// apart is the point of the split: this component has no state machine in
// it at all, only a record and what you can do next about it.
//
// Takes either of two shapes, because two different sources feed it:
//   - the full serializeVouch payload (see backend/src/lib/vouchTurn.js),
//     which carries counterparty/status/timeline — from /vouches/given and
//     /vouches/received;
//   - the flat fromName/fromCategory/fromTier shape that accountView.js
//     builds for the public profile, still used by pages/app/Profile.jsx.
// `counterparty` is the discriminator. The flat shape has no history, so
// the timeline simply doesn't render for it.
function VouchListItem({ vouch, mode, onChanged }) {
  const { business } = useAuth();
  const [vouchBackOpen, setVouchBackOpen] = useState(false);
  const [vouchAgainOpen, setVouchAgainOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  // Both remaining ways into a fresh vouch from this screen: "Vouch back" on
  // one you received, "Vouch again" on one that was cancelled. Same gate as
  // the directory's Vouch button and the Vouches page's — a Free member can
  // reach the pitch from wherever the thought occurs to them, and hears the
  // same sentence each time (components/app/UpgradePrompt.jsx owns the copy).
  const vouchGate = useUpgradeGate("giveVouch");

  const other =
    vouch.counterparty ??
    (mode === "received"
      ? { id: vouch.fromBusinessId, name: vouch.fromName, category: vouch.fromCategory, tier: vouch.fromTier }
      : null);
  if (!other) return null;

  // Expiry stores status "cancelled" too (see backend's vouchExpiry.js), so
  // the status field alone can't tell a real cancel from a timeout — the
  // audit log can. Worth distinguishing: only one of them is somebody's
  // decision, and only one is fair to flag.
  const expired = vouch.timeline?.some((e) => e.action === "expire");
  const closed = mode === "given" && vouch.status === "cancelled";
  const statusLabel = closed ? (expired ? "Expired" : "Cancelled") : null;
  const date = vouch.date ?? vouch.lastActionAt ?? vouch.createdAt;

  // "Vouch back" is a fresh POST /vouches, so it's bound by the same one-
  // per-pair rule as any other vouch — a reciprocal one already in flight or
  // published makes it a guaranteed 409. Reciprocity is the whole point of
  // this card, so the common case here is precisely the one that breaks:
  // you vouch for them, they vouch back, and the button stays lit on both
  // sides afterwards.
  const reciprocal = mode === "received" ? existingVouchTo(business, other.id) : null;

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
            {statusLabel && (
              <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {statusLabel}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {other.category} · {date ? new Date(date).toLocaleDateString() : ""}
          </div>
        </div>
      </div>

      <blockquote className="mt-4 border-l-2 border-accent pl-4 text-sm italic text-foreground">
        "{vouch.testimonial}"
      </blockquote>

      {/* Shown on settled vouches too, not just closed ones. "Why didn't
          this land?" is the obvious question on a decline, but "what did
          they originally write, and what did I ask them to change?" is
          just as reasonable to ask about one that succeeded — and both
          parties get the same answer. */}
      <VouchTimeline timeline={vouch.timeline} />

      <div className="mt-4 flex flex-wrap gap-2">
        {mode === "received" && (
          <>
            <Button size="sm" variant="secondary" onClick={() => toast.success(`Thanked ${other.name}`)}>
              Thank
            </Button>
            {/* Replaced by a line rather than shown disabled, per the note in
                lib/vouchRules.js — a dead button reads as a bug, whereas
                "already vouched" is the answer to the question the button
                would have raised. */}
            {reciprocal ? (
              <span className="self-center text-xs text-muted-foreground">
                {reciprocal.status === "published"
                  ? "You've vouched for them too"
                  : reciprocal.status === "under_review"
                    ? "Your vouch for them is with an admin"
                    : "Your vouch for them is in progress"}
              </span>
            ) : (
              <Button size="sm" onClick={vouchGate.guard(() => setVouchBackOpen(true))}>
                Vouch back
              </Button>
            )}
          </>
        )}
        {closed && (
          <>
            <Button size="sm" onClick={vouchGate.guard(() => setVouchAgainOpen(true))}>
              Vouch again
            </Button>
            {/* Only for an actual cancellation — there's nobody to hold
                responsible for a timeout, and the API rejects it anyway. */}
            {!expired && (
              <Button size="sm" variant="ghost" onClick={() => setFlagOpen(true)}>
                Flag unfair cancel
              </Button>
            )}
          </>
        )}
      </div>

      {mode === "received" && !reciprocal && (
        <VouchDialog open={vouchBackOpen} onOpenChange={setVouchBackOpen} targetBusiness={other} onSuccess={onChanged} />
      )}
      <UpgradePrompt gate={vouchGate} />
      {closed && (
        <>
          <VouchDialog
            open={vouchAgainOpen}
            onOpenChange={setVouchAgainOpen}
            targetBusiness={other}
            initialTestimonial={vouch.testimonial}
            onSuccess={onChanged}
          />
          <FlagCancelDialog
            vouch={vouch}
            other={other}
            open={flagOpen}
            onOpenChange={setFlagOpen}
            onSuccess={onChanged}
          />
        </>
      )}
    </div>
  );
}

export { VouchListItem };
