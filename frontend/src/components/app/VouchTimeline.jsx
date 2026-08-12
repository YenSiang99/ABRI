import { Check, Clock, CornerUpLeft, Flag, Gavel, PenLine, Send, X } from "lucide-react";

// Renders the server's per-vouch audit log (the VouchAction table, via
// serializeAction in backend/src/lib/vouchTurn.js).
//
// Three properties matter.
//
// SYMMETRIC — both parties see the identical list. This is what fixes the
// giver being told "Revise" without ever being shown the note explaining
// what to change.
//
// COMPLETE — every version of the giver's text appears, including the
// first. An earlier cut rendered text only on `revise` entries, on the
// reasoning that the original was already the card's headline quote; but
// the headline always shows the CURRENT text, so revision 1 silently
// vanished the moment revision 2 existed and the trail looked like it had
// been overwritten. Every submit/revise now prints its own revision.
//
// HISTORICAL — the text under an entry is the text as it stood at that
// moment, read from that action's revision, never from the live vouch.
//
// Each entry is its own bordered panel on the rail rather than a run of
// text under a dot. With several rounds of revisions the flat version ran
// together — a quote, a note, then the next entry's headline, all at the
// same size a few pixels apart, with nothing saying where one step ended
// and the next began. The panel does that job, so the two inner blocks it
// used to take (a quoted box and a grey bubble) collapse into plain text
// inside it: one level of nesting instead of two.
const ACTIONS = {
  submit: { icon: Send, message: (who) => `${who} sent the vouch for review` },
  revise: { icon: PenLine, message: (who) => `${who} revised the testimonial` },
  revert: { icon: CornerUpLeft, message: (who) => `${who} sent it back for edits` },
  // The one outcome worth colouring: it's the point of the whole exchange,
  // and on a long trail it's what the eye should find first.
  accept: { icon: Check, message: (who) => `${who} accepted the vouch`, tone: "accent" },
  cancel: { icon: X, message: (who) => `${who} cancelled the vouch`, tone: "danger" },
  // Says only that it happened. The reason and note the receiver filed go
  // to admins, not onto the shared trail — the giver shouldn't read the
  // report against them here, and the flag entry carries no `comment` for
  // that reason (see the flag route in backend/src/routes/vouches.js).
  flag: { icon: Flag, message: (who) => `${who} put this on hold for admin review`, tone: "danger" },
  // No actor — this one lapsed rather than being anybody's decision.
  expire: { icon: Clock, message: () => "No response for 14 days — closed automatically" },
  // Admin decisions. They take no `who` either: the server sends `byAdmin`
  // but never the admin's name to the two businesses, so there's nothing to
  // interpolate and nothing here should imply there is. The ruling itself
  // renders through the shared `comment` block below, same as a revert note.
  // All three share the gavel — which way it went is in the words; that it
  // came from outside the two businesses is what the marker has to say.
  admin_return: {
    icon: Gavel,
    message: () => "An admin reviewed this and returned it for the receiver to decide",
  },
  admin_revert: {
    icon: Gavel,
    message: () => "An admin reviewed this and sent it back for edits",
  },
  admin_cancel: {
    icon: Gavel,
    message: () => "An admin reviewed this and cancelled the vouch",
    tone: "danger",
  },
};

// Which actions carry the giver's text (as opposed to the receiver's reply).
const WRITES_REVISION = new Set(["submit", "revise"]);

// The marker sits ON the rail, so it needs the card's own background to
// punch the line out from under it — every parent that renders this
// timeline is a `bg-card` panel.
const TONE = {
  accent: "border-accent bg-accent text-accent-foreground",
  danger: "border-border bg-card text-destructive",
};
const TONE_DEFAULT = "border-border bg-card text-muted-foreground";

function actorLabel(actor) {
  if (!actor) return "";
  return actor.isYou ? "You" : actor.name;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function VouchTimeline({ timeline }) {
  if (!timeline?.length) return null;

  return (
    <ol className="mt-4 space-y-2 border-l border-border pl-6">
      {timeline.map((entry) => {
        const config = ACTIONS[entry.action];
        if (!config) return null;
        const Icon = config.icon;

        return (
          <li
            key={entry.id}
            className="relative rounded-xl border border-border bg-background px-3.5 py-2.5"
          >
            <span
              className={`absolute -left-[35px] top-2 flex h-5 w-5 items-center justify-center rounded-full border ${
                TONE[config.tone] ?? TONE_DEFAULT
              }`}
            >
              <Icon className="h-3 w-3" strokeWidth={2.5} />
            </span>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-xs font-medium text-foreground">
                {config.message(actorLabel(entry.actor))}
              </span>
              <span className="text-[11px] text-muted-foreground">{formatDate(entry.createdAt)}</span>
            </div>

            {/* The giver's text. No version label: the entry's own headline
                ("sent the vouch for review" vs "revised the testimonial") and
                date already place the quote in the sequence, so numbering it
                was noise stacked on top of the words themselves. */}
            {WRITES_REVISION.has(entry.action) && entry.revisionComment && (
              <blockquote className="mt-2 border-l-2 border-accent pl-3 text-xs italic leading-relaxed text-foreground">
                "{entry.revisionComment}"
              </blockquote>
            )}

            {/* The receiver's own words on this action — what they want
                changed, or why they cancelled. Plain text now: the headline
                directly above it already names who is speaking, and the
                panel is the thing keeping it separate from the next step. */}
            {entry.comment && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{entry.comment}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export { VouchTimeline };
