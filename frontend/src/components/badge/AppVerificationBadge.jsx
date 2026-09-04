import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { cn } from "@/lib/utils";

function AppVerificationBadge({ verificationLevel, className }) {
  return (
    <VerificationBadge
      verificationLevel={verificationLevel}
      size="inline"
      chip
      className={cn("border-border bg-card", className)}
    />
  );
}

export { AppVerificationBadge };
