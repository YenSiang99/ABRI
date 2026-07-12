import { UserPlus, Sparkle, TrendingUp, ShieldCheck, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ladderLabel } from "@/data/appMockData";

const ladderStyles = {
  none: "bg-muted text-muted-foreground border-border",
  first: "bg-secondary text-secondary-foreground border-border",
  top20: "bg-secondary text-secondary-foreground border-border",
  trusted: "bg-foreground text-background border-foreground",
  leader: "bg-foreground text-background border-foreground",
};

const ladderIcon = {
  none: UserPlus,
  first: Sparkle,
  top20: TrendingUp,
  trusted: ShieldCheck,
  leader: Crown,
};

function VouchBadge({ ladder, className }) {
  const Icon = ladderIcon[ladder];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        ladderStyles[ladder],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {ladderLabel[ladder]}
    </span>
  );
}

export { VouchBadge };
