import { UserPlus, Sparkle, TrendingUp, ShieldCheck, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { endorsementLevelLabel } from "@/lib/trustLabels";

const endorsementLevelStyles = {
  none: "bg-muted text-muted-foreground border-border",
  first: "bg-secondary text-secondary-foreground border-border",
  top20: "bg-secondary text-secondary-foreground border-border",
  trusted: "bg-foreground text-background border-foreground",
  leader: "bg-foreground text-background border-foreground",
};

const endorsementLevelIcon = {
  none: UserPlus,
  first: Sparkle,
  top20: TrendingUp,
  trusted: ShieldCheck,
  leader: Crown,
};

function EndorsementBadge({ endorsementLevel, className }) {
  // Falls back rather than indexing blind. `endorsementLevelIcon[unknown]` is
  // undefined, and rendering undefined as a component throws "Element type
  // is invalid", which unwinds the whole route — a white screen on the
  // dashboard, the directory and every profile, not a missing badge.
  //
  // An unknown value reaches here whenever the client and server disagree
  // about this union: a stale bundle after a deploy, a rolled-back frontend,
  // or a value added on the server first. None of those should cost the
  // member the page they were looking at.
  const Icon = endorsementLevelIcon[endorsementLevel] ?? UserPlus;
  const label = endorsementLevelLabel[endorsementLevel] ?? "";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        endorsementLevelStyles[endorsementLevel] ?? endorsementLevelStyles.none,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export { EndorsementBadge };
