import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VouchListItem } from "@/components/app/VouchListItem";
import { LockedFeature } from "@/components/app/LockedFeature";
import { useAuth } from "@/context/AuthContext";
import { useBusinesses, addVouch, listVouchesGivenBy } from "@/lib/store/businesses";
import { toast } from "@/lib/toast";

const VOUCHABLE_TIERS = new Set(["T2", "T3", "T4"]);

function Vouches() {
  const { business } = useAuth();
  const allBusinesses = useBusinesses();
  const locked = business.tier === "T1";

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [testimonial, setTestimonial] = useState("");

  const filtered = allBusinesses
    .filter(
      (b) =>
        b.id !== business.id &&
        VOUCHABLE_TIERS.has(b.tier) &&
        b.name.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 6);

  const givenVouches = locked ? [] : listVouchesGivenBy(business.id);

  const submit = () => {
    if (!selected || !testimonial.trim()) {
      toast.error("Pick a business and write a short testimonial");
      return;
    }
    addVouch(selected.id, {
      fromBusinessId: business.id,
      fromName: business.name,
      testimonial: testimonial.trim(),
    });
    toast.success(`Vouched for ${selected.name}`);
    setOpen(false);
    setSelected(null);
    setTestimonial("");
    setSearch("");
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            The give-first engine
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Vouches
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Real peers staking their reputation on real businesses. Give a vouch, unlock the next tier.
          </p>
        </div>

        {locked ? (
          <div className="text-sm text-muted-foreground">Vouching unlocks after SSM verification.</div>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" /> Vouch for a business
                </Button>
              }
            />
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Vouch for a business</DialogTitle>
                <DialogDescription>
                  You're staking your reputation. Vouch only for businesses you'd genuinely recommend.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
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
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submit}>Submit vouch</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="received" className="mt-8">
        <TabsList>
          <TabsTrigger value="received">Received ({locked ? 0 : business.vouches.length})</TabsTrigger>
          <TabsTrigger value="given">Given ({givenVouches.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="mt-6 grid gap-4 md:grid-cols-2">
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouches locked"
                description="Vouches you receive will appear here once your SSM verification is complete."
              />
            </div>
          ) : business.vouches.length > 0 ? (
            business.vouches.map((v) => <VouchListItem key={v.id} vouch={v} mode="received" />)
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">No vouches yet.</p>
          )}
        </TabsContent>

        <TabsContent value="given" className="mt-6 grid gap-4 md:grid-cols-2">
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouching locked"
                description="You can vouch for other businesses once your SSM verification is complete."
              />
            </div>
          ) : givenVouches.length > 0 ? (
            givenVouches.map((v) => <VouchListItem key={v.id} vouch={v} mode="given" />)
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">No vouches given yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { Vouches };
