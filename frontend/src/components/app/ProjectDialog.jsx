import { useEffect, useState } from "react";
import { X } from "lucide-react";

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
import { fetchServiceCatalogue } from "@/lib/api/serviceCatalogue";
import { fetchBusinesses } from "@/lib/api/businesses";
import { createProject } from "@/lib/api/projects";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/lib/toast";

// Lives in components/app/ beside AskDialog because two screens open it: the
// projects board header, and AskDetail once an answer has been accepted.
//
// THE ONE THING TO GET RIGHT HERE is that the service each business will be
// credited with is a proposal, not an assignment. What this dialog sends for an
// invitee is what the INVITE suggests; the invitee settles it when they join,
// and only they can change it afterwards. Completing the project then writes
// confirmed engagements from those declarations — which is only defensible
// because of that. The copy under the invite list says so in as many words,
// because a creator picking services for other businesses would otherwise
// reasonably assume they were deciding.

function ChipRow({ options, value, onChange, allowClear = false }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(allowClear && value === option ? null : option)}
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

function ProjectDialog({ open, onOpenChange, onSuccess, initial }) {
  const { business } = useAuth();

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [visibility, setVisibility] = useState("private");
  const [service, setService] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [invites, setInvites] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ forQuery: null, rows: [] });
  const [submitting, setSubmitting] = useState(false);

  // Reset on open, adjusted DURING RENDER rather than in an effect — the house
  // convention (AskDialog, VouchDialog). An effect would paint the previous
  // project's values for one frame before clearing them.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle(initial?.title ?? "");
      setDetail(initial?.detail ?? "");
      setMonth(new Date().toISOString().slice(0, 7));
      setVisibility("private");
      setService(null);
      setQuery("");
      setResults({ forQuery: null, rows: [] });
      setInvites(
        initial?.invite ? [{ business: initial.invite, service: null }] : [],
      );
      setSubmitting(false);
    }
  }

  // The creator's own service catalogue — their own category, because this is
  // what THEY are delivering. Stored keyed by the category it was fetched for,
  // so a stale response simply isn't `forCategory` and never renders against
  // the wrong list.
  useEffect(() => {
    if (!open || !business?.category) return undefined;
    let live = true;
    fetchServiceCatalogue(business.category)
      .then((data) => {
        if (live) setCatalogue({ forCategory: business.category, ...data });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, business?.category]);

  // Results are stored KEYED BY THE QUERY they were fetched for, and never
  // cleared inside the effect — the pattern AskDialog uses for its service
  // catalogue. Clearing here meant a synchronous setState in the effect body
  // (the cascading-render case react-hooks/set-state-in-effect flags); the
  // stored key does the same job better, because a response for a previous
  // query simply isn't `forQuery` and so is never rendered against this one.
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      fetchBusinesses({ search: q, limit: 8 })
        .then((rows) => {
          // fetchBusinesses resolves to the ARRAY, not the envelope — see the
          // note on it in lib/api/businesses.js.
          if (live) setResults({ forQuery: q, rows });
        })
        .catch(() => {});
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  // Filtered at render rather than at fetch, so adding somebody to the invite
  // list removes them from the results without refetching — and without the
  // effect having to depend on `invites`, which would refire it on every pick.
  const visibleResults =
    results.forQuery === query.trim()
      ? results.rows
          .filter(
            (b) =>
              b.id !== business?.id &&
              // An L0 listing has no account behind it, so nobody there could
              // ever accept. The server refuses it too; filtering here is so
              // the member never reaches for something that cannot work.
              b.verificationLevel !== "L0" &&
              !invites.some((i) => i.business.id === b.id),
          )
          .slice(0, 6)
      : [];

  const catalogueReady = catalogue?.forCategory === business?.category;
  const ready = title.trim() && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    try {
      const project = await createProject({
        title: title.trim(),
        detail: detail.trim() || undefined,
        startedOn: `${month}-01T00:00:00.000Z`,
        visibility,
        service: service ?? undefined,
        askId: initial?.askId,
        invites: invites.map((i) => ({
          businessId: i.business.id,
          service: i.service ?? undefined,
        })),
      });
      toast.success("Project started — the businesses you invited will see it.");
      onOpenChange(false);
      onSuccess?.(project);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* max-h + a scrolling body, because this dialog is taller than a short
          laptop viewport and components/ui/dialog.jsx caps neither. Without it
          the footer — including the button that actually creates the project —
          sits off-screen with no way to reach it. Fixed here rather than in the
          primitive so the change cannot alter every other dialog in the app;
          the primitive is worth revisiting if a third tall one appears. */}
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start a project</DialogTitle>
          <DialogDescription>
            A shared space for work you're doing together. When you finish it, the work record
            is written to everyone's profile — so this is the thing that turns a conversation
            into proof.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <Field label="What is it">
            <Input
              className="mt-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Year-end close for a manufacturing client"
              maxLength={120}
            />
          </Field>

          <Field label="Anything worth saying (optional)">
            <Textarea
              className="mt-2"
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Scope, who's doing what, anything the others should know."
              maxLength={400}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Only the businesses on this project ever see this.
            </p>
          </Field>

          <Field label="Started">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              max={new Date().toISOString().slice(0, 7)}
              className="mt-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </Field>

          {catalogueReady && catalogue.services?.length > 0 && (
            <Field label="What you're providing (optional)">
              <ChipRow
                options={catalogue.services}
                value={service}
                onChange={setService}
                allowClear
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                This is what gets confirmed on your profile when the project finishes. Leave it
                blank if you're the client here.
              </p>
            </Field>
          )}

          <Field label="Who else is on it">
            <Input
              className="mt-2"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the directory…"
            />
            {visibleResults.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-xl border border-border">
                {visibleResults.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setInvites((current) => [...current, { business: b, service: null }]);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent/10"
                  >
                    <span className="text-sm font-medium text-foreground">{b.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {b.category} · {b.location}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {invites.length > 0 && (
              <div className="mt-3 space-y-2">
                {invites.map((invite) => (
                  <div
                    key={invite.business.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {invite.business.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {invite.business.category}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${invite.business.name}`}
                      onClick={() =>
                        setInvites((current) =>
                          current.filter((i) => i.business.id !== invite.business.id),
                        )
                      }
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  They decide what service they're providing when they accept — you're inviting
                  them, not signing them up.
                </p>
              </div>
            )}
          </Field>

          <Field label="When it's finished">
            {/* Two chips rather than a switch: the choice is between two
                outcomes a member should be able to read, and "Public" on its
                own invites the reasonable guess that the conversation goes
                public too. It never does, under either setting. */}
            <div className="mt-2 grid gap-2">
              {[
                {
                  value: "private",
                  label: "Keep the project private",
                  hint: "The work still appears on both profiles as a confirmed engagement. The project itself doesn't.",
                },
                {
                  value: "public",
                  label: "Publish a summary on both profiles",
                  hint: "Title, dates and who took part. Never the description or anything anyone writes here.",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVisibility(option.value)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    visibility === option.value
                      ? "border-foreground bg-accent/10"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  <div className="text-sm font-medium text-foreground">{option.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{option.hint}</div>
                </button>
              ))}
            </div>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready}>
            {submitting ? "Starting…" : "Start project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ProjectDialog };
