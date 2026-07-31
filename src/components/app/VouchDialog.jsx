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
import { addVouch, isVouchable } from "@/lib/store/businesses";
import { toast } from "@/lib/toast";

function VouchDialog({ open, onOpenChange, targetBusiness, businesses }) {
  const { business } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [testimonial, setTestimonial] = useState("");

  const fixed = Boolean(targetBusiness);
  const active = fixed ? targetBusiness : selected;

  const filtered = fixed || !businesses
    ? []
    : businesses
        .filter((b) => isVouchable(b, business.id) && b.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 6);

  function reset() {
    setSelected(null);
    setTestimonial("");
    setSearch("");
  }

  function submit() {
    if (!active || !testimonial.trim()) {
      toast.error("Pick a business and write a short testimonial");
      return;
    }
    addVouch(active.id, {
      fromBusinessId: business.id,
      fromName: business.name,
      testimonial: testimonial.trim(),
    });
    toast.success(`Vouched for ${active.name}`);
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vouch for a business</DialogTitle>
          <DialogDescription>
            You're staking your reputation. Vouch only for businesses you'd genuinely recommend.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fixed ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
                {targetBusiness.name.charAt(0)}
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">{targetBusiness.name}</div>
                <div className="text-xs text-muted-foreground">{targetBusiness.category}</div>
              </div>
            </div>
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
              Testimonial (optional · 140 chars)
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Submit vouch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { VouchDialog };
