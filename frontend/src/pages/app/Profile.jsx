import { useState } from "react";
import { Pencil, Radio, MapPin, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { VouchBadge } from "@/components/badge/VouchBadge";
import { VouchListItem } from "@/components/app/VouchListItem";
import { LockedFeature } from "@/components/app/LockedFeature";
import { useAuth } from "@/context/AuthContext";
import { updateMyBusiness } from "@/lib/api/businesses";
import { ContactDetails } from "@/components/business/ContactDetails";
import { planAllows } from "@/lib/plans";
import { toast } from "@/lib/toast";

function Stat({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function formatMemberSince(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(iso));
}

// Every field this dialog edits, and the empty-string default each one resets
// to. All six contact columns are nullable, so "" is what an unset field looks
// like in an input — and "" is also what the server reads as "clear it", which
// makes the round trip symmetrical.
const FIELDS = ["description", "phone", "whatsapp", "email", "website", "address", "openingHours"];

function EditProfileDialog({ business, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function seed() {
    const next = Object.fromEntries(FIELDS.map((f) => [f, business[f] ?? ""]));
    next.services = business.services.join(", ");
    return next;
  }

  function onOpenChange(next) {
    setOpen(next);
    if (next) {
      setForm(seed());
      setError(null);
    }
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Async, and that is the fix rather than a detail. This used to be a
  // synchronous call into a localStorage store that no screen read back — it
  // toasted "Profile updated" and changed nothing, on every device. Now it
  // awaits the PATCH, awaits refreshAccount() so the page reflects what the
  // server actually stored (the server normalises: a WhatsApp number comes
  // back as bare digits, a website gains its scheme), and only then closes.
  //
  // On failure the dialog STAYS OPEN with the server's message. Never toast
  // success on a write that was rejected — that is the exact bug this
  // replaces.
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateMyBusiness({
        ...Object.fromEntries(FIELDS.map((f) => [f, form[f] ?? ""])),
        services: (form.services ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      await onSaved();
      toast.success("Profile updated");
      setOpen(false);
    } catch (err) {
      setError(err.message ?? "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="secondary">
            <Pencil className="mr-1.5 h-4 w-4" /> Edit profile
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>This is what other members see on your public profile.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">About</label>
            <Textarea
              className="mt-2"
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Services (comma-separated)
            </label>
            <Input
              className="mt-2"
              value={form.services ?? ""}
              onChange={(e) => set("services", e.target.value)}
            />
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-sm font-semibold text-foreground">Contact details</div>
            {/* The honest statement of the gate, next to the inputs it
                governs — not only in the pricing table. An owner filling
                these in deserves to know who will actually see them. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Phone, WhatsApp and email are shown to logged-in members, on Plus and above.
              Website, address and opening hours are public on every plan.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Phone</label>
              <Input
                className="mt-2"
                placeholder="03-7955 1234"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">WhatsApp</label>
              <Input
                className="mt-2"
                placeholder="012-345 6789"
                value={form.whatsapp ?? ""}
                onChange={(e) => set("whatsapp", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Contact email
            </label>
            <Input
              className="mt-2"
              placeholder="hello@yourcompany.my"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Website</label>
            <Input
              className="mt-2"
              placeholder="yourcompany.my"
              value={form.website ?? ""}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Address</label>
            <Input
              className="mt-2"
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Opening hours
            </label>
            <Textarea
              className="mt-2"
              rows={3}
              placeholder={"Mon–Fri 9am–6pm\nSat 9am–1pm"}
              value={form.openingHours ?? ""}
              onChange={(e) => set("openingHours", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Profile() {
  const { account, business, refreshAccount } = useAuth();
  const locked = business.tier === "T1";
  // The owner always sees their own testimonials here (/auth/me is
  // ungated) — this is only about what VISITORS get on the public profile.
  const testimonialsHidden =
    business.vouchCount > 0 && !planAllows(business.membershipPlan, "testimonials");
  // Same shape as the line above, and the same reason: /auth/me is ungated, so
  // the owner always sees their own contact details here. These two flags are
  // only about what VISITORS get on the public profile.
  const hasAnyContact = Boolean(business.phone || business.whatsapp || business.email);
  const contactHidden = hasAnyContact && !planAllows(business.membershipPlan, "contactDetails");
  const contactEmpty = !hasAnyContact && planAllows(business.membershipPlan, "contactDetails");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-2xl font-semibold text-background">
              {business.name.charAt(0)}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Member profile
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {business.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" /> {business.category}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {business.location}
                </span>
                {account?.createdAt && <span>Member since {formatMemberSince(account.createdAt)}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <AppTierBadge tier={business.tier} />
                <VouchBadge ladder={business.ladder} />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  <Radio className="h-3 w-3" /> Live
                </span>
              </div>
            </div>
          </div>
          <EditProfileDialog business={business} onSaved={refreshAccount} />
        </div>

        <div className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">SSM Record</div>
            <div className="mt-1 font-mono text-sm text-foreground">Reg. {business.ssm}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Vouches Received</div>
            <div className="mt-1 text-sm text-foreground">
              {locked ? "Unlocks after SSM verification" : `${business.vouchCount} peers`}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</div>
            <div className="mt-1 text-sm text-foreground">{business.category}</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="vouches">Vouches ({locked ? 0 : business.vouchCount})</TabsTrigger>
          <TabsTrigger value="card">NFC Card</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{business.description}</p>
          </div>
          {/* contactLocked false: this is the owner's own view, which is
              never gated. The upsell below is what tells them the public
              profile looks different. */}
          <ContactDetails business={business} contactLocked={false} ownerView />

          {/* The owner's side of the gate, and the one place selling it is
              right — they're looking at the exact details visitors can't
              see, so the gap is concrete rather than abstract. */}
          {contactHidden && (
            <LockedFeature
              requiredPlan="plus"
              title="Your contact details aren't shown to anyone"
              description="You've added them, but nobody visiting your profile or tapping your card can see them."
            />
          )}
          {/* The inverse nudge. On a paid plan an empty contact block is the
              feature being wasted, and this is the only screen that can say
              so — a visitor would just see a profile with no phone number. */}
          {contactEmpty && (
            <p className="text-sm text-muted-foreground">
              Your plan shows your contact details to members — but you haven't added any yet. Use
              Edit profile to add a phone number, WhatsApp or email.
            </p>
          )}

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Services</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {business.services.map((s) => (
                <span key={s} className="rounded-full border border-border bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vouches" className="mt-6 grid gap-4 md:grid-cols-2">
          {/* The upgrade pitch lives here and nowhere else. The owner is
              the only person who should be sold this, and this is the one
              screen where they're looking at the exact text that visitors
              can't see — so the gap is concrete rather than abstract. */}
          {/* The owner's side of the same gate a visitor meets on the public
              profile — and the one place in the app where selling the
              upgrade is the right thing to do, since it's their own page
              that's being held back. */}
          {!locked && testimonialsHidden && (
            <div className="md:col-span-2">
              <LockedFeature
                requiredPlan="plus"
                title="Your written vouches aren't shown"
                description={`Visitors can see that you have ${business.vouchCount} ${
                  business.vouchCount === 1 ? "vouch" : "vouches"
                } — but not what any of them say.`}
              />
            </div>
          )}
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouches locked"
                description="Vouches you receive will appear here once your SSM verification is complete."
              />
            </div>
          ) : business.vouchCount > 0 ? (
            // onChanged was missing here, so "Vouch back" from this page
            // submitted fine but left the UI showing pre-submit state.
            business.vouches.map((v) => (
              <VouchListItem key={v.id} vouch={v} mode="received" onChanged={refreshAccount} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">No vouches yet.</p>
          )}
        </TabsContent>

        <TabsContent value="card" className="mt-6">
          {locked ? (
            <LockedFeature
              title="NFC card locked"
              description="Your physical trust token unlocks once your SSM verification is complete."
            />
          ) : (
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your NFC card
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                Physical trust token
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Verification status renders before contact details on every tap.
              </p>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl border border-foreground/10 bg-foreground p-6 text-background shadow-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-widest opacity-60">
                        ABRI · Verified
                      </div>
                      <div className="mt-6 text-xl font-semibold">{business.name}</div>
                      <div className="text-xs opacity-70">{business.category}</div>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
                      A
                    </div>
                  </div>
                  <div className="absolute right-6 bottom-5 left-6 flex items-end justify-between font-mono text-[10px] opacity-70">
                    <span>SSM {business.ssm}</span>
                    <span>TAP TO VERIFY</span>
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-4">
                  <Stat label="Card taps this month" value="23" />
                  <Stat label="Leads captured" value="8" />
                  <Stat label="Status" value="Active · Founding batch" />
                  <Button variant="outline" onClick={() => toast("Replacement request sent")}>
                    Request replacement (RM50)
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { Profile };
