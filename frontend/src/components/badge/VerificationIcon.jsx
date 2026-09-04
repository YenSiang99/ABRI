// Three decorative marks for the marketing site — "registered", "verified",
// "trusted". These are NOT verification levels: they never index by L0-L4 and
// never come off a Business row.
//
// The prop is `mark`, not `level`, because it was called `tier` until Aug 2026
// — which made it a FOURTH unrelated meaning of that word, alongside the
// verification level, the membership tier and the vouch ladder. Splitting it
// out is what let the other three become unambiguous.
//
// Never use mark="verified" as a generic tick. That yellow is the SSM-verified
// colour, and it turns any surface it lands on into a trust claim — which is
// exactly how it ended up as the "included" checkmark inside the billing
// table. See the chip comment in components/app/AppSidebar.jsx.

import { FileText, Check, Star } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconVariants = cva(
  "rounded-full flex items-center justify-center flex-none",
  {
    variants: {
      mark: {
        registered: "bg-grey-100 text-grey-600 dark:bg-grey-700 dark:text-muted-foreground",
        verified: "bg-yellow text-yellow-ink",
        trusted: "bg-ink text-yellow dark:bg-grey-700",
      },
      size: {
        small: "w-[18px] h-[18px]",
        medium: "w-[38px] h-[38px]",
        large: "w-[84px] h-[84px]",
      },
    },
    defaultVariants: {
      mark: "verified",
      size: "small",
    },
  },
);

const MARK_ICON = {
  registered: FileText,
  verified: Check,
  trusted: Star,
};

const ICON_SIZE = {
  small: "w-[11px] h-[11px]",
  medium: "w-[23px] h-[23px]",
  large: "w-[50px] h-[50px]",
};

function VerificationIcon({ mark, size = "inline" }) {
  const Icon = MARK_ICON[mark];

  return (
    <span className={cn(iconVariants({ mark, size }))}>
      <Icon className={ICON_SIZE[size]} strokeWidth={2.5} />
    </span>
  );
}

export { VerificationIcon };
