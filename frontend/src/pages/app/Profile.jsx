import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Pencil,
  Radio,
  MapPin,
  Building2,
  Briefcase,
  Check,
  Gem,
} from "lucide-react";
import {
  EngagementList,
  RepeatSignal,
} from "@/components/business/EngagementList";
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
import { AppVerificationBadge } from "@/components/badge/AppVerificationBadge";
import { VouchBadge } from "@/components/badge/VouchBadge";
import { VouchListItem } from "@/components/app/VouchListItem";
import { LockedFeature } from "@/components/app/LockedFeature";
import { useAuth } from "@/context/AuthContext";
import { updateMyBusiness, fetchBusinesses } from "@/lib/api/businesses";
import { proposeEngagement } from "@/lib/api/engagements";
import { ContactDetails } from "@/components/business/ContactDetails";
import { membershipTierAllows } from "@/lib/membershipTiers";
import { toast } from "@/lib/toast";
import { fetchServiceCatalogue } from "@/lib/api/serviceCatalogue";
import { CLAIMED } from "@/lib/verificationLevels";

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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

// Every field this dialog edits, and the empty-string default each one resets
// to. All six contact columns are nullable, so "" is what an unset field looks
// like in an input — and "" is also what the server reads as "clear it", which
// makes the round trip symmetrical.
const FIELDS = [
  "description",
  "phone",
  "whatsapp",
  "email",
  "website",
  "address",
  "openingHours",
];

// The services picker — the half of this page the Asks board depends on.
//
// WHY THIS IS NOT A TEXT INPUT ANY MORE. It was one comma-separated field, and
// that made every service a unique string: "SSM filings", "SSM filing" and
// "ssm  filings" are three values no query can join. Category and location were
// closed for exactly this reason (see lib/businessVocab.js) because the Asks
// board routes on them by equality; services were left behind, which is why the
// board can only match on category today. Picking from a list is what turns
// this field into something an ask can be routed by.
//
// CUSTOM SERVICES SURVIVE, deliberately — see backend/src/lib/serviceVocab.js.
// A closed list would be a claim that we can name every professional service in
// the Klang Valley. What the split buys is honesty about which ones match: the
// catalogue ones do, a typed one is shown and searched but routed by nothing,
// and the UI says so rather than letting an owner think they are covered.
// Log work with another business.
//
// THE COUNTERPARTY IS PICKED, NEVER TYPED. An engagement is a claim about a
// specific business that has to reach that business's Inbox to be confirmed —
// a typed name has nobody to send it to. This searches the directory and
// submits an id, which is also why an unclaimed listing cannot be chosen: the
// server refuses one (nobody there could ever confirm) and offering it here
// would produce a failure the member could not have predicted.
function LogEngagementDialog({ business, onSaved }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [target, setTarget] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [service, setService] = useState("");
  const [note, setNote] = useState("");
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setQuery("");
    setResults([]);
    setTarget(null);
    setService("");
    setNote("");
    setMonth(new Date().toISOString().slice(0, 7));
    setError(null);
  }

  function onOpenChange(next) {
    setOpen(next);
    if (next) reset();
  }

  // The service list follows the TARGET's category, not the member's own. The
  // work was delivered by whoever did it, and logging "SST advisory" against a
  // law firm because the logger is an accountant would put a service on their
  // profile they do not offer.
  // Stores the category alongside the list rather than clearing it on target
  // change. Clearing meant a synchronous setState in the effect body — the
  // cascading-render pattern react-hooks/set-state-in-effect flags — and the
  // stored key does the same job better: a list fetched for a previous target
  // is simply not `forCategory`, so it is never rendered against the new one.
  useEffect(() => {
    if (!target) return undefined;
    let live = true;
    fetchServiceCatalogue(target.category)
      .then(
        (data) =>
          live && setCatalogue({ forCategory: target.category, ...data }),
      )
      .catch(
        () =>
          live && setCatalogue({ forCategory: target.category, services: [] }),
      );
    return () => {
      live = false;
    };
  }, [target]);

  const catalogueReady = target && catalogue?.forCategory === target.category;

  async function search(value) {
    setQuery(value);
    setTarget(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const rows = await fetchBusinesses({ search: value.trim(), limit: 8 });
      setResults(
        rows
          .filter((b) => b.id !== business.id && b.verificationLevel !== "L0")
          .slice(0, 6),
      );
    } catch {
      setResults([]);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await proposeEngagement({
        businessId: target.id,
        service: service || undefined,
        note: note.trim() || undefined,
        // The server floors this to the first of the month; sending a day at
        // all is an artefact of <input type="month"> needing one to parse.
        occurredOn: `${month}-01T00:00:00.000Z`,
      });
      await onSaved();
      toast.success(`Sent to ${target.name} to confirm`, {
        description: "It appears on both profiles once they agree.",
      });
      setOpen(false);
    } catch (err) {
      setError(err.message ?? "Couldn't log that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Briefcase className="h-3.5 w-3.5" /> Log work
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log work with another business</DialogTitle>
          <DialogDescription>
            They have to confirm it before it appears on either profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Who did you work with?
            </label>
            {target ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm text-foreground">
                  {target.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {target.category}
                  </span>
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setTarget(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  className="mt-2"
                  placeholder="Search the directory"
                  value={query}
                  onChange={(e) => search(e.target.value)}
                />
                {results.length > 0 && (
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                    {results.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => setTarget(b)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                        >
                          {b.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {b.category}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              When
            </label>
            <Input
              type="month"
              className="mt-2"
              value={month}
              max={new Date().toISOString().slice(0, 7)}
              onChange={(e) => setMonth(e.target.value)}
            />
            {/* Said plainly, because a member who expects day precision will
                otherwise think the field is broken. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Month is enough — nobody remembers the day, and pretending
              otherwise invites arguments about it.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              What was the work?
            </label>
            {!target ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Pick a business first.
              </p>
            ) : !catalogueReady ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Loading services…
              </p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  {catalogue.services.map((sv) => (
                    <button
                      key={sv}
                      type="button"
                      onClick={() => setService(service === sv ? "" : sv)}
                      aria-pressed={service === sv}
                      className={
                        "rounded-full border px-3 py-1.5 text-[13px] transition-colors " +
                        (service === sv
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground")
                      }
                    >
                      {sv}
                    </button>
                  ))}
                </div>
                {/* Optional, and the consequence of leaving it out is stated
                    rather than left to be discovered — an engagement with no
                    service is real but appears in no aggregate. */}
                <p className="mt-2 text-xs text-muted-foreground">
                  Optional. Without one this still counts as work you did
                  together, but it won&rsquo;t appear under any service on their
                  profile.
                </p>
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Note (optional)
            </label>
            <Textarea
              className="mt-2"
              rows={2}
              maxLength={280}
              placeholder="One line, so the two of you can tell it apart later."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!target || saving}>
            {saving ? "Sending…" : "Send to confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The owner's own "Worked with", plus the thing only they can see: which of
// the services they CLAIM has anybody actually confirmed.
//
// THAT SECOND HALF IS THE POINT OF THIS PANEL. A business can tick every
// service in its category and nothing checks it — this is the only surface in
// the product that shows the owner the gap between what they advertise and
// what a counterparty has stood behind. Shown to the owner alone, and framed
// as something to go and collect rather than as a failing: an unconfirmed
// service is not a lie, it is just unevidenced.
function OwnEngagements({ business, onChanged }) {
  const entries = business.engagements ?? [];
  const summary = business.engagementSummary ?? {
    total: 0,
    services: [],
    repeatCounterparties: null,
  };
  const confirmedServices = new Set(summary.services.map((s) => s.service));
  const claimed = business.services ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Worked with
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmed by the other side. This is what visitors see.
          </p>
        </div>
        <LogEngagementDialog business={business} onSaved={onChanged} />
      </div>

      <RepeatSignal repeatCounterparties={summary.repeatCounterparties} owner />

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing yet. Log work you&rsquo;ve done with another member — once
          they confirm it, it shows on both your profiles.
        </p>
      ) : (
        <EngagementList entries={entries} limit={6} className="mt-4" />
      )}

      {claimed.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            <Gem className="h-3.5 w-3.5" />
            All services, backed and verified by real businesses
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {claimed.map((sv) => {
              const backed = confirmedServices.has(sv);
              return (
                <li
                  key={sv}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] " +
                    (backed
                      ? "border-border text-foreground"
                      : "border-dashed border-border text-muted-foreground")
                  }
                >
                  {backed && <Check className="h-3.5 w-3.5" />}
                  {sv}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Ticked ones have at least one confirmed engagement behind them. The
            rest are still just claims — only you see this.
          </p>
        </div>
      )}
    </div>
  );
}


function ServicePicker({ category, selected, onChange }) {
  const [catalogue, setCatalogue] = useState(null);
  const [custom, setCustom] = useState("");
  const [showOthers, setShowOthers] = useState(false);

  useEffect(() => {
    let live = true;
    fetchServiceCatalogue(category)
      .then((data) => live && setCatalogue(data))
      .catch(() => live && setCatalogue({ services: [], others: [] }));
    return () => {
      live = false;
    };
  }, [category]);

  const canonical = new Set([
    ...(catalogue?.services ?? []),
    ...(catalogue?.others ?? []).flatMap((o) => o.services),
  ]);
  // Anything selected that the catalogue does not know about. Listed
  // separately so it is visible that it is different, not hidden among the
  // chips that do match.
  const customSelected = selected.filter((s) => !canonical.has(s));

  function toggle(service) {
    onChange(
      selected.includes(service)
        ? selected.filter((s) => s !== service)
        : [...selected, service],
    );
  }

  function addCustom() {
    const value = custom.trim();
    if (!value) return;
    // Case-insensitive, because the server canonicalises on write and a member
    // who types a catalogue service in lower case should see the chip they
    // already have light up rather than get a second one.
    const existing = [...canonical, ...selected].find(
      (s) => s.toLowerCase() === value.toLowerCase(),
    );
    if (existing) {
      if (!selected.includes(existing)) onChange([...selected, existing]);
    } else {
      onChange([...selected, value]);
    }
    setCustom("");
  }

  function Chip({ service }) {
    const on = selected.includes(service);
    return (
      <button
        type="button"
        onClick={() => toggle(service)}
        aria-pressed={on}
        className={
          "rounded-full border px-3 py-1.5 text-[13px] transition-colors " +
          (on
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground hover:text-foreground")
        }
      >
        {service}
      </button>
    );
  }

  return (
    <div>
      <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        Services
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick what you actually do. These are what the asks board uses to route
        work to you.
      </p>

      {catalogue === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading services…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {catalogue.services.map((s) => (
              <Chip key={s} service={s} />
            ))}
          </div>

          {/* Behind a toggle, not hidden: an accounting firm that genuinely
              does payroll-software integration should be able to say so, but
              showing forty chips from four categories by default would bury
              the twelve that fit. */}
          {catalogue.others?.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowOthers((v) => !v)}
                className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {showOthers ? "Hide" : "Show"} services from other categories
              </button>
              {showOthers &&
                catalogue.others.map((group) => (
                  <div key={group.category} className="mt-3">
                    <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                      {group.category}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {group.services.map((s) => (
                        <Chip key={s} service={s} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {customSelected.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Your own
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {customSelected.map((s) => (
                  <Chip key={s} service={s} />
                ))}
              </div>
              {/* Said plainly rather than left to be discovered. An owner who
                  thinks a typed service routes work to them is worse off than
                  one who knows it does not. */}
              <p className="mt-2 text-xs text-muted-foreground">
                Shown on your profile, but asks aren&rsquo;t routed by these —
                pick from the list above where one fits.
              </p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Input
              placeholder="Add your own service"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  // The dialog's save button is the form's default action;
                  // Enter here means "add this chip", never "submit".
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustom}
              disabled={!custom.trim()}
            >
              Add
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function EditProfileDialog({ business, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function seed() {
    const next = Object.fromEntries(FIELDS.map((f) => [f, business[f] ?? ""]));
    // An ARRAY now, not a joined string — the picker below owns the list and
    // the comma was only ever a way to fake multi-select in a text input.
    next.services = business.services ?? [];
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
        services: form.services ?? [],
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
          <DialogDescription>
            This is what other members see on your public profile.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              About
            </label>
            <Textarea
              className="mt-2"
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <ServicePicker
            category={business.category}
            selected={form.services ?? []}
            onChange={(next) => set("services", next)}
          />

          <div className="border-t border-border pt-4">
            <div className="text-sm font-semibold text-foreground">
              Contact details
            </div>
            {/* The honest statement of the gate, next to the inputs it
                governs — not only in the pricing table. An owner filling
                these in deserves to know who will actually see them. */}
            <p className="mt-1 text-xs text-muted-foreground">
              Phone, WhatsApp and email are shown to logged-in members, on Plus
              and above. Website, address and opening hours are public on every
              tier.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Phone
              </label>
              <Input
                className="mt-2"
                placeholder="03-7955 1234"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                WhatsApp
              </label>
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
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Website
            </label>
            <Input
              className="mt-2"
              placeholder="yourcompany.my"
              value={form.website ?? ""}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Address
            </label>
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
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
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
  const locked = business.verificationLevel === CLAIMED;
  // The owner always sees their own testimonials here (/auth/me is
  // ungated) — this is only about what VISITORS get on the public profile.
  const testimonialsHidden =
    business.vouchCount > 0 &&
    !membershipTierAllows(business.membershipTier, "testimonials");
  // Same shape as the line above, and the same reason: /auth/me is ungated, so
  // the owner always sees their own contact details here. These two flags are
  // only about what VISITORS get on the public profile.
  const hasAnyContact = Boolean(
    business.phone || business.whatsapp || business.email,
  );
  const contactHidden =
    hasAnyContact &&
    !membershipTierAllows(business.membershipTier, "contactDetails");
  const contactEmpty =
    !hasAnyContact &&
    membershipTierAllows(business.membershipTier, "contactDetails");

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
                {account?.createdAt && (
                  <span>
                    Member since {formatMemberSince(account.createdAt)}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Linked, same as the Dashboard row and for the same reason.
                    Wrapped here rather than inside the badge components — they
                    also render on other businesses' profiles, where this link
                    would be wrong. */}
                <Link
                  to="/app/verify"
                  aria-label="What the verification level means"
                >
                  <AppVerificationBadge
                    verificationLevel={business.verificationLevel}
                  />
                </Link>
                <Link to="/app/vouches" aria-label="What the vouch level means">
                  <VouchBadge vouchLevel={business.vouchLevel} />
                </Link>
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
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              SSM Record
            </div>
            <div className="mt-1 font-mono text-sm text-foreground">
              Reg. {business.ssm}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Vouches Received
            </div>
            <div className="mt-1 text-sm text-foreground">
              {locked
                ? "Unlocks after SSM verification"
                : `${business.vouchCount} peers`}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Category
            </div>
            <div className="mt-1 text-sm text-foreground">
              {business.category}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="vouches">
            Vouches ({locked ? 0 : business.vouchCount})
          </TabsTrigger>
          <TabsTrigger value="card">NFC Card</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              About
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {business.description}
            </p>
          </div>

          {/* Directly under About, above contact. It is the factual record of
              what this business has actually done, and the only place the
              owner can see which of their claimed services anybody has stood
              behind. */}
          <OwnEngagements business={business} onChanged={refreshAccount} />

          {/* contactLocked false: this is the owner's own view, which is
              never gated. The upsell below is what tells them the public
              profile looks different. */}
          <ContactDetails business={business} contactLocked={false} ownerView />

          {/* The owner's side of the gate, and the one place selling it is
              right — they're looking at the exact details visitors can't
              see, so the gap is concrete rather than abstract. */}
          {contactHidden && (
            <LockedFeature
              requiredMembershipTier="plus"
              title="Your contact details aren't shown to anyone"
              description="You've added them, but nobody visiting your profile or tapping your card can see them."
            />
          )}
          {/* The inverse nudge. On a paid plan an empty contact block is the
              feature being wasted, and this is the only screen that can say
              so — a visitor would just see a profile with no phone number. */}
          {contactEmpty && (
            <p className="text-sm text-muted-foreground">
              Your tier shows your contact details to members — but you haven't
              added any yet. Use Edit profile to add a phone number, WhatsApp or
              email.
            </p>
          )}

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Services
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {business.services.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-sm text-secondary-foreground"
                >
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
                requiredMembershipTier="plus"
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
              <VouchListItem
                key={v.id}
                vouch={v}
                mode="received"
                onChanged={refreshAccount}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">
              No vouches yet.
            </p>
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
                      <div className="mt-6 text-xl font-semibold">
                        {business.name}
                      </div>
                      <div className="text-xs opacity-70">
                        {business.category}
                      </div>
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
                  <Button
                    variant="outline"
                    onClick={() => toast("Replacement request sent")}
                  >
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
