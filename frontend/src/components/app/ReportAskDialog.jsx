import { useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { flagAsk, flagAnswer } from "@/lib/api/asks";
import { toast } from "@/lib/toast";

// Reporting is free on every tier and always will be. A member must be able
// to report abusive content without paying — the same rule that keeps
// cancelling and flagging a vouch off the paywall.
//
// Two reason lists rather than one, mirroring ASK_FLAG_REASONS and
// ANSWER_FLAG_REASONS on the server: "self promotion" is meaningless against
// an ask and "not a real ask" is meaningless against an answer, and one merged
// list would offer every reporter four options of which two are nonsense.
const ASK_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "not_a_real_ask", label: "Not a real requirement" },
  { value: "abusive_content", label: "Abusive content" },
  { value: "other", label: "Something else" },
];

const ANSWER_REASONS = [
  { value: "self_promotion", label: "Self-promotion dressed as a recommendation" },
  { value: "irrelevant", label: "Irrelevant to the ask" },
  { value: "abusive_content", label: "Abusive content" },
  { value: "other", label: "Something else" },
];

// target: { kind: "ask" | "answer", askId, answerId?, live: boolean }
function ReportAskDialog({ open, onOpenChange, target, onSuccess }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setReason(null);
      setNote("");
    }
  }

  const isAnswer = target?.kind === "answer";
  const reasons = isAnswer ? ANSWER_REASONS : ASK_REASONS;

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      if (isAnswer) await flagAnswer(target.askId, target.answerId, { reason, note });
      else await flagAsk(target.askId, { reason, note });
      // Worded from what the server actually did, which differs by whether
      // the thing was still live: a report against a settled ask records the
      // report and freezes nothing, and saying "it's on hold" there would be
      // a promise the backend didn't make.
      toast.success(
        target.live
          ? "Reported — it's on hold until an admin reviews it."
          : "Reported. An admin will look at it.",
      );
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {isAnswer ? "answer" : "ask"}</DialogTitle>
          <DialogDescription>
            {target?.live
              ? "It stops being visible to other members while an admin reviews it. The person who posted it is told it was reported, but not by whom."
              : "This one has already settled, so nothing will change on the board. The report is recorded for an admin to read."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Why?
            </label>
            <div className="mt-2 flex flex-col gap-2">
              {reasons.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    reason === r.value
                      ? "border-foreground bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Anything else? (optional)
            </label>
            <Textarea
              className="mt-2"
              maxLength={300}
              rows={3}
              placeholder="Only an admin sees this."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!reason || submitting}>
            {submitting ? "Reporting…" : "Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ReportAskDialog };
