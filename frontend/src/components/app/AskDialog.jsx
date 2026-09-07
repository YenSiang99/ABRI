import { useState } from "react";

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
      setTitle("");
      setDetail("");
    }
  }

  const ready = category && matchCategory && matchLocation && title.trim();

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const ask = await postAsk({ category, matchCategory, matchLocation, title, detail });
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
            Say what you need. The businesses who do that work, in that area, will see it on their
            dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Field label="What kind of need is this?">
            <ChipRow options={ASK_CATEGORIES} value={category} onChange={setCategory} />
          </Field>

          <Field label="Who could help?">
            <ChipRow
              options={BUSINESS_CATEGORIES}
              value={matchCategory}
              onChange={setMatchCategory}
            />
          </Field>

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
            <div className="mt-1 text-right text-xs text-muted-foreground">{title.length}/120</div>
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
            <div className="mt-1 text-right text-xs text-muted-foreground">{detail.length}/400</div>
          </Field>

          {/* The constraints, stated while writing rather than discovered
              afterwards. Both numbers are the server's defaults; if an ask
              ever carries a different cap, this line is read off the ask. */}
          <p className="text-xs text-muted-foreground">
            Up to 6 businesses can answer. It closes automatically after 30 days.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
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
