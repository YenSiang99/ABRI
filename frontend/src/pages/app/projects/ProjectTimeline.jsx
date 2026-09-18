import { Check, Eye, Flag, LogOut, MessageSquare, UserPlus, X } from "lucide-react";

// The project's timeline: system rows and the things participants wrote, in one
// list.
//
// Modelled on components/app/VouchTimeline.jsx, and it keeps that component's
// three properties for the same reasons:
//
// SYMMETRIC — every participant sees the identical list. A trail one side can
// see more of is not a shared record of how the work went.
//
// COMPLETE — nothing is summarised away. The system rows are what make the
// written ones legible: "joined · posted · posted · completed" is a story, and
// the same three messages without the joins are a chat log.
//
// APPEND-ONLY — the server never UPDATEs a row here (see ProjectUpdate in
// schema.prisma). A history that can be rewritten is not a history.
//
// PRIVATE UNDER EVERY VISIBILITY. Project.visibility publishes the shell — the
// title, dates and who took part — and never this. Nothing on this screen has a
// public counterpart, which is worth knowing before adding anything to it.
const KINDS = {
  created: { icon: Flag, message: (who) => `${who} started the project` },
  joined: { icon: UserPlus, message: (who) => `${who} joined`, tone: "accent" },
  left: { icon: LogOut, message: (who) => `${who} left the project` },
  visibility_changed: {
    icon: Eye,
    message: (who) => `${who} changed who can see this`,
  },
  // The outcome the whole thing exists for, and the one worth colouring: on a
  // long trail it is what the eye should find first.
  completed: {
    icon: Check,
    message: (who) => `${who} completed the project — the work record was written`,
    tone: "accent",
  },
  cancelled: { icon: X, message: (who) => `${who} cancelled the project`, tone: "danger" },
  update: { icon: MessageSquare, message: (who) => who },
};

const TONES = {
  accent: "text-foreground",
  danger: "text-destructive",
};

function ProjectTimeline({ updates }) {
  if (!updates || updates.length === 0) return null;

  return (
    <ol className="mt-4 space-y-2 border-l border-border pl-6">
      {updates.map((entry) => {
        const kind = KINDS[entry.type];
        if (!kind) return null;
        const Icon = kind.icon;
        const who = entry.authorIsYou ? "You" : (entry.author?.name ?? "Someone");

        return (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[31px] top-3 flex h-4 w-4 items-center justify-center rounded-full bg-background">
              <Icon className={`h-3.5 w-3.5 ${TONES[kind.tone] ?? "text-muted-foreground"}`} />
            </span>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span
                  className={`text-sm ${
                    entry.type === "update"
                      ? "font-semibold text-foreground"
                      : (TONES[kind.tone] ?? "text-muted-foreground")
                  }`}
                >
                  {kind.message(who)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              {entry.body && (
                <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
                  {entry.body}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export { ProjectTimeline };
