import { useState } from "react";
import { Search } from "lucide-react";

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
import { useAuth } from "@/context/AuthContext";
import { isVouchable } from "@/lib/vouchRules";
import { submitVouch, reviseVouch } from "@/lib/api/vouches";
import { toast } from "@/lib/toast";

// mode "create": submit a fresh vouch (against a fixed targetBusiness, or
// picked from a search list). mode "revise": editing an existing vouch
// that's in "reverted" — vouchId/initialTestimonial required,
// no business picker (the target is already fixed by the existing vouch).
function VouchDialog({
  open,
  onOpenChange,
  targetBusiness,
  businesses,
  mode = "create",
  vouchId,
  initialTestimonial = "",
  onSuccess,
}) {
  const { business } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [testimonial, setTestimonial] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fields are reset on every open (not on close) so a dialog reused for
  // different vouches — e.g. "Vouch back" pre-targeting a different
  // business each time — never shows stale state from a previous use.
  // Adjusting state during render (guarded by comparing against the
  // previous `open` value) rather than in a useEffect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelected(null);
      setSearch("");
      // Seeded in both modes: "revise" starts from the text being changed,
      // and "Vouch again" on a closed vouch starts from what was written
      // last time rather than a blank box.
      setTestimonial(initialTestimonial ?? "");
    }
  }

  const fixed = mode === "revise" || Boolean(targetBusiness);
  const active = mode === "revise" ? targetBusiness : fixed ? targetBusiness : selected;

  const filtered = fixed || !businesses
    ? []
    : businesses
        .filter((b) => isVouchable(b, business.id) && b.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 6);

  async function submit() {
    if (mode === "revise") {
      if (!testimonial.trim()) {
        toast.error("Add an updated testimonial");
        return;
      }
      setSubmitting(true);
      try {
        await reviseVouch(vouchId, testimonial.trim());
        toast.success("Revision sent for review");
        onOpenChange(false);
        onSuccess?.();
      } catch (err) {
        toast.error(err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!active || !testimonial.trim()) {
      toast.error("Pick a business and write a short testimonial");
      return;
    }
    setSubmitting(true);
    try {
      await submitVouch({ toBusinessId: active.id, testimonial: testimonial.trim() });
      toast.success(`Vouch sent to ${active.name} for review`);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "revise" ? "Revise your vouch" : "Vouch for a business"}</DialogTitle>
          <DialogDescription>
            {mode === "revise"
              ? "Update your testimonial based on their feedback, then resend it for review."
              : "You're staking your reputation. Vouch only for businesses you'd genuinely recommend."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fixed ? (
            active && (
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
                  {active.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{active.name}</div>
                  <div className="text-xs text-muted-foreground">{active.category}</div>
                </div>
              </div>
            )
          ) : (
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Business
              </label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search SSM-verified businesses…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {search && (
                <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border">
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
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">
                          {b.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{b.name}</div>
                          <div className="text-xs text-muted-foreground">{b.category}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {/* Not optional, despite what this label used to say: both
                  branches of submit() reject empty text, and it's the body
                  of the vouch's first VouchRevision server-side. */}
              Testimonial (140 chars)
            </label>
            <Textarea
              className="mt-2"
              maxLength={140}
              rows={3}
              placeholder="Why should peers trust them?"
              value={testimonial}
              onChange={(e) => setTestimonial(e.target.value)}
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{testimonial.length}/140</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : mode === "revise" ? "Resend vouch" : "Submit vouch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { VouchDialog };
