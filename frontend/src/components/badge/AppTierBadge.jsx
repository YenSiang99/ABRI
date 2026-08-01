import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { cn } from "@/lib/utils";

function AppTierBadge({ tier, className }) {
  return (
    <VerificationBadge
      tier={tier}
      size="inline"
      chip
      className={cn("border-border bg-card", className)}
    />
  );
}

export { AppTierBadge };
