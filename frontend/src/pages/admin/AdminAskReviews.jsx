import { useEffect, useState } from "react";
import { Flag, ShieldCheck } from "lucide-react";

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
import {
  fetchAskReviews,
  decideAskReview,
  decideAnswerReview,
  resolveAskFlag,
} from "@/lib/api/admin";
import { toast } from "@/lib/toast";

// Mirrors ASK_DECISIONS / ANSWER_DECISIONS in backend/src/routes/admin.js,
// with the human copy the server has no business holding.
//
// `outcome` appears nowhere here on purpose: the server derives it from the
// decision, so an admin cannot record "closed it, but the report was fine".
// The consequence line under each button is what makes that derivation
// visible to the person clicking it.
const ASK_DECISIONS = {
  restore: {
    label: "Put it back",
    consequence: "The ask reopens and its 30 days start again. The report is dismissed.",
    noteRequired: false,
  },
  close: {
    label: "Close it",
    consequence: "The ask is closed for good and the report is upheld. Say why.",
    noteRequired: true,
  },
};

const ANSWER_DECISIONS = {
  restore: {
    label: "Put it back",
    consequence:
      "The answer goes back in front of the asker to decide on. The report is dismissed.",
    noteRequired: false,
  },
  remove: {
    label: "Remove it",
    consequence:
      "The answer is removed and stops showing on any profile. Its author can't re-answer. Say why.",
    noteRequired: true,
  },
};

const REASON_LABELS = {
  spam: "Spam",
  not_a_real_ask: "Not a real requirement",
  self_promotion: "Self-promotion",
  irrelevant: "Irrelevant",
  abusive_content: "Abusive content",
  other: "Something else",
};

function Pill({ children, strong = false }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs font-medium ${
        strong ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function DecisionDialog({ open, onOpenChange, pending, onDone }) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setNote("");
  }

  const config = pending?.config;

  async function submit() {
    if (submitting) return;
    if (config?.noteRequired && !note.trim()) {
      toast.error("Add a note saying why.");
      return;
    }
    setSubmitting(true);
    try {
      if (pending.kind === "ask") {
        await decideAskReview(pending.id, { decision: pending.decision, note });
      } else {
        await decideAnswerReview(pending.id, { decision: pending.decision, note });
      }
      toast.success("Decision recorded.");
      onOpenChange(false);
      onDone();
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
          <DialogTitle>{config?.label}</DialogTitle>
          <DialogDescription>{config?.consequence}</DialogDescription>
        </DialogHeader>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Note {config?.noteRequired ? "(required)" : "(optional)"}
          </label>
          <Textarea
            className="mt-2"
            rows={3}
            maxLength={400}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving…" : config?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminAskReviews() {
  const [loaded, setLoaded] = useState({ reviews: [], error: null, key: null });
  const [showAll, setShowAll] = useState(false);
  const [token, setToken] = useState(0);
  const [pending, setPending] = useState(null);

  const key = `${showAll}|${token}`;

  useEffect(() => {
    let cancelled = false;
    fetchAskReviews({ status: showAll ? "all" : undefined })
      .then((reviews) => {
        if (!cancelled) setLoaded({ reviews, error: null, key });
      })
      .catch((err) => {
        if (!cancelled) setLoaded({ reviews: [], error: err.message, key });
      });
    return () => {
      cancelled = true;
    };
  }, [key, showAll]);

  const loading = loaded.key !== key;
  const reload = () => setToken((n) => n + 1);

  async function onResolve(flagId, outcome) {
    try {
      await resolveAskFlag(flagId, { outcome });
      toast.success("Report resolved.");
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Admin
      </div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
        Ask review
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Reported asks and answers. Anything frozen is at the top — those have a member waiting on
        you, and nothing frozen ever drops off this list.
      </p>

      <div className="mt-6">
        <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show open work only" : "Show resolved too"}
        </Button>
      </div>

      {loading ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : loaded.error ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Couldn't load the queue. Refresh to try again.
        </div>
      ) : loaded.reviews.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 text-sm text-muted-foreground">
            Nothing reported. Nothing on the board is frozen.
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {loaded.reviews.map((review) => (
            <div key={review.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">{review.title}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {review.askedBy.name} · {review.category}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {review.askFrozen && <Pill strong>Ask frozen</Pill>}
                  {review.frozenAnswers.length > 0 && (
                    <Pill strong>
                      {review.frozenAnswers.length} answer
                      {review.frozenAnswers.length === 1 ? "" : "s"} frozen
                    </Pill>
                  )}
                  {!review.askFrozen && review.frozenAnswers.length === 0 && (
                    <Pill>Nothing frozen</Pill>
                  )}
                </div>
              </div>

              {review.detail && (
                <p className="mt-3 text-sm text-muted-foreground">{review.detail}</p>
              )}

              {/* The reports themselves. The reporter is shown to the ADMIN and
                  to nobody else — the member whose content was reported is
                  told it happened, never by whom. */}
              <div className="mt-4 space-y-2">
                {review.flags.map((flag) => (
                  <div
                    key={flag.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 text-sm">
                      <div className="flex items-center gap-2 text-foreground">
                        <Flag className="h-3.5 w-3.5 shrink-0" />
                        {REASON_LABELS[flag.reason] ?? flag.reason}
                        {flag.answerId && <Pill>on an answer</Pill>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {flag.raisedBy.name} → {flag.against.name}
                        {flag.status === "reviewed" && ` · ${flag.outcome}`}
                      </div>
                      {flag.note && (
                        <p className="mt-1 text-xs text-muted-foreground">"{flag.note}"</p>
                      )}
                    </div>
                    {/* Only offered for reports that froze nothing. One whose
                        target is frozen goes through the decision below, so
                        the ruling and the content move together — the server
                        refuses it here anyway. */}
                    {flag.status === "open" &&
                      !review.askFrozen &&
                      !review.frozenAnswers.some((a) => a.id === flag.answerId) && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => onResolve(flag.id, "dismissed")}>
                            Dismiss
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onResolve(flag.id, "upheld")}>
                            Uphold
                          </Button>
                        </div>
                      )}
                  </div>
                ))}
              </div>

              {review.askFrozen && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                  {Object.entries(ASK_DECISIONS).map(([decision, config]) => (
                    <Button
                      key={decision}
                      size="sm"
                      variant={decision === "restore" ? "default" : "outline"}
                      onClick={() => setPending({ kind: "ask", id: review.id, decision, config })}
                    >
                      {config.label}
                    </Button>
                  ))}
                </div>
              )}

              {review.frozenAnswers.map((answer) => (
                <div key={answer.id} className="mt-4 rounded-lg border border-border p-3">
                  <div className="text-sm text-foreground">
                    <span className="font-semibold">{answer.answeredBy.name}</span>{" "}
                    {answer.isSelfNomination
                      ? "offered their own services"
                      : `recommended ${answer.recommended.name}`}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{answer.comment}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(ANSWER_DECISIONS).map(([decision, config]) => (
                      <Button
                        key={decision}
                        size="sm"
                        variant={decision === "restore" ? "default" : "outline"}
                        onClick={() => setPending({ kind: "answer", id: answer.id, decision, config })}
                      >
                        {config.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <DecisionDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        pending={pending}
        onDone={reload}
      />
    </div>
  );
}

export { AdminAskReviews };
