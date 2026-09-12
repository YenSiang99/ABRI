import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
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
import { ASK_CATEGORIES } from "@/lib/askVocab";
import { BUSINESS_CATEGORIES, BUSINESS_LOCATIONS } from "@/lib/businessVocab";
import { fetchServiceCatalogue } from "@/lib/api/serviceCatalogue";
import { postAsk } from "@/lib/api/asks";
import { toast } from "@/lib/toast";

// Lives in components/app/ beside VouchDialog because two screens open it:
// the board header and (later) the dashboard prompt.
//
// The three closed lists render as CHIP ROWS rather than <select>s. Partly
// because there is no select primitive in components/ui — only six exist, on
// Base UI rather than Radix — but mostly because it's better here: seven
// categories, four trades and six locations all fit on screen at once, and
// seeing the whole vocabulary is what stops somebody typing a synonym into
// the title because they couldn't find theirs in a dropdown.

function ChipRow({ options, value, onChange }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            value === option
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/30"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function AskDialog({ open, onOpenChange, onSuccess }) {
  const [category, setCategory] = useState(null);
  const [matchCategory, setMatchCategory] = useState(null);
  const [matchLocation, setMatchLocation] = useState(null);
  const [matchServices, setMatchServices] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [answerLimit, setAnswerLimit] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset on open, adjusted during render rather than in a useEffect — the
  // convention VouchDialog.jsx states and links the React docs for.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCategory(null);
      setMatchCategory(null);
      setMatchLocation(null);
      // Reset with the rest, or a second ask opens carrying the first one's
      // targeting — the failure mode this whole block exists to prevent, and
      // the one that would be least visible because the chips sit behind a
      // category choice the member has not made yet.
      setMatchServices([]);
      setAnswerLimit("");
      setTitle("");
      setDetail("");
    }
  }

  // Keyed by category rather than cleared on change, for the reason the
  // engagement dialog gives: clearing meant a synchronous setState in the
  // effect body, and the stored key does the same job — a list fetched for a
  // previous trade is simply not `forCategory`, so it never renders.
  useEffect(() => {
    if (!matchCategory) return undefined;
    let live = true;
    fetchServiceCatalogue(matchCategory)
      .then(
        (data) => live && setCatalogue({ forCategory: matchCategory, ...data }),
      )
      .catch(
        () =>
          live && setCatalogue({ forCategory: matchCategory, services: [] }),
      );
    return () => {
      live = false;
    };
  }, [matchCategory]);

  // Services belong to the trade they were picked from. Keeping them after a
  // trade change would address an ask to businesses in one category using a
  // service from another, which matches nobody — a silent miss, and this is
  // the only place it could be introduced.
  function pickMatchCategory(next) {
    setMatchCategory(next);
    setMatchServices([]);
  }

  const ready = category && matchCategory && matchLocation && title.trim();

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const ask = await postAsk({
        category,
        matchCategory,
        matchLocation,
        matchServices,
        // "" means they left it alone, which is no cap — not a cap of zero.
        maxAnswers: answerLimit === "" ? undefined : Number(answerLimit),
        title,
        detail,
      });
      toast.success("Ask posted — the businesses who do this will see it.");
      onOpenChange(false);
      onSuccess?.(ask);
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
          <DialogTitle>Post an ask</DialogTitle>
          <DialogDescription>
            Say what you need. The businesses who do that work, in that area,
            will see it on their dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Field label="What kind of need is this?">
            <ChipRow
              options={ASK_CATEGORIES}
              value={category}
              onChange={setCategory}
            />
          </Field>

          <Field label="Who could help?">
            <ChipRow
              options={BUSINESS_CATEGORIES}
              value={matchCategory}
              onChange={pickMatchCategory}
            />
          </Field>

          {/* Narrows routing to businesses that do a specific thing. Drawn
              from the catalogue for the trade they just picked — a service
              from another category would address nobody, since the category
              filter runs first. Clearing matchCategory clears these for the
              same reason. */}
          {matchCategory && catalogue?.forCategory === matchCategory && (
            <Field label="Anything specific? (optional)">
              <div className="mt-2 flex flex-wrap gap-2">
                {catalogue.services.map((sv) => {
                  const on = matchServices.includes(sv);
                  return (
                    <button
                      key={sv}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setMatchServices((prev) =>
                          on ? prev.filter((x) => x !== sv) : [...prev, sv],
                        )
                      }
                      className={
                        "rounded-full border px-3 py-1.5 text-[13px] transition-colors " +
                        (on
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground")
                      }
                    >
                      {sv}
                    </button>
                  );
                })}
              </div>
              {/* The consequence of leaving it blank, said rather than left to
                  be discovered: blank is WIDER, not narrower. */}
              <p className="mt-2 text-xs text-muted-foreground">
                Leave blank and everyone in that trade sees it. Pick one or more
                and it reaches the businesses who say they do it, first.
              </p>
            </Field>
          )}

          <Field label="Where?">
            <ChipRow
              options={BUSINESS_LOCATIONS}
              value={matchLocation}
              onChange={setMatchLocation}
            />
          </Field>

          <Field label="What are you looking for? (120 chars)">
            <Input
              className="mt-2"
              maxLength={120}
              placeholder="Looking for a corporate secretary in KL"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {title.length}/120
            </div>
          </Field>

          <Field label="Limit answers? (optional)">
            {/* NULL BY DEFAULT, and that is the change this field surfaces.
                Every ask used to cap at 6, which never bound at current
                density and, the moment it did, would lock out the seventh
                business to answer — selecting on speed rather than fit. The
                limit is now the asker's to set if they want one. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={answerLimit}
                onChange={(e) => setAnswerLimit(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] text-foreground outline-none focus:border-ring"
              >
                <option value="">No limit</option>
                {[3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} answers
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {answerLimit === ""
                  ? "Anyone who can help may answer."
                  : `Closes to new answers after ${answerLimit}.`}
              </span>
            </div>
          </Field>

          <Field label="Any detail? (optional)">
            <Textarea
              className="mt-2"
              maxLength={400}
              rows={3}
              placeholder="Anything that helps someone point you at the right business."
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {detail.length}/400
            </div>
          </Field>

          {/* The constraints, stated while writing rather than discovered
              afterwards. Both numbers are the server's defaults; if an ask
              ever carries a different cap, this line is read off the ask. */}
          <p className="text-xs text-muted-foreground">
            Up to 6 businesses can answer. It closes automatically after 30
            days.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || submitting}>
            {submitting ? "Posting…" : "Post ask"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { AskDialog };
