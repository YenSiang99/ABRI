import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { useAuth } from "@/context/AuthContext";
import { answerAsk } from "@/lib/api/asks";
import { toast } from "@/lib/toast";
import { UNCLAIMED } from "@/lib/verificationLevels";

// Inline on the ask page, not a dialog: a modal over the thing you are
// answering hides the thing you are answering.
//
// The mode toggle at the top is the anti-self-promotion mechanism's UI half.
// Both modes are legitimate — blocking self-nomination in a cluster this size
// would be absurd, since the accountant who sees "looking for an accountant"
// should be able to say so — but they produce structurally different answers
// (see AskAnswer in schema.prisma) and must never look alike.

function ModeChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

function AnswerComposer({ ask, businesses, onSuccess }) {
  const { business } = useAuth();
  const [mode, setMode] = useState("recommend");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSelf = mode === "self";

  // T0 listings are deliberately INCLUDED. An answer is addressed to the
  // asker, not to the business named, so recommending an unclaimed listing
  // does nothing to an absent owner — and once the corridor SSM import lands,
  // the best answer will routinely be a business that hasn't claimed yet.
  // Excluded instead: the asker (recommending them to themselves is noise)
  // and yourself (that's what the other mode is for).
  const filtered = !businesses
    ? []
    : businesses
        .filter(
          (b) =>
            b.id !== ask.askedBy.id &&
            b.id !== business?.id &&
            b.name.toLowerCase().includes(search.toLowerCase()),
        )
        .slice(0, 6);

  const target = isSelf ? business : selected;
  const ready = target && comment.trim();

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      await answerAsk(ask.id, { recommendedBusinessId: target.id, comment });
      toast.success(
        isSelf ? "Answer posted — listed as your own services." : `Recommended ${target.name}.`,
      );
      setComment("");
      setSelected(null);
      setSearch("");
      onSuccess?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-semibold text-foreground">Answer this ask</div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ModeChip active={!isSelf} onClick={() => setMode("recommend")}>
          Recommend someone else
        </ModeChip>
        <ModeChip active={isSelf} onClick={() => setMode("self")}>
          Offer my own services
        </ModeChip>
      </div>

      {isSelf ? (
        // Saying the cost out loud is what makes the label honest rather than
        // a trap somebody discovers after posting.
        <p className="mt-4 rounded-lg border border-border bg-secondary p-3 text-xs text-muted-foreground">
          You'll be listed as offering your own services. That's fine — it's just labelled
          differently, and it doesn't count as a recommendation on your profile.
        </p>
      ) : (
        <div className="mt-4">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Which business?
          </label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search the directory…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No matches</div>
              ) : (
                filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setSelected(b);
                      setSearch(b.name);
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary ${
                      selected?.id === b.id ? "bg-secondary" : ""
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">
                      {b.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">{b.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {b.category} · {b.location}
                      </div>
                    </div>
                    <AppVerificationBadge verificationLevel={b.verificationLevel} />
                  </button>
                ))
              )}
            </div>
          )}
          {/* Told up front, not discovered afterwards: an unclaimed listing
              can be recommended, the recommendation is real, and it appears
              on their profile when they claim it. */}
          {selected?.verificationLevel === UNCLAIMED && (
            <p className="mt-2 text-xs text-muted-foreground">
              {selected.name} hasn't claimed their listing yet — your recommendation appears on
              their profile when they do.
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {isSelf ? "Why are you the right fit?" : "Why should they use them?"}
        </label>
        <Textarea
          className="mt-2"
          maxLength={300}
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">{comment.length}/300</div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {ask.slotsLeft} of {ask.maxAnswers} {ask.slotsLeft === 1 ? "slot" : "slots"} left. One
          answer per business.
        </span>
        <Button size="sm" onClick={submit} disabled={!ready || submitting}>
          {submitting ? "Posting…" : "Post answer"}
        </Button>
      </div>
    </div>
  );
}

export { AnswerComposer };
