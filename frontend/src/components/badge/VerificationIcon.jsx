import { FileText, Check, Star } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconVariants = cva(
  "rounded-full flex items-center justify-center flex-none",
  {
    variants: {
      tier: {
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
      tier: "verified",
      size: "small",
    },
  },
);

const TIER_ICON = {
  registered: FileText,
  verified: Check,
  trusted: Star,
};

const ICON_SIZE = {
  small: "w-[11px] h-[11px]",
  medium: "w-[23px] h-[23px]",
  large: "w-[50px] h-[50px]",
};

function VerificationIcon({ tier, size = "inline" }) {
  const Icon = TIER_ICON[tier];

  return (
    <span className={cn(iconVariants({ tier, size }))}>
      <Icon className={ICON_SIZE[size]} strokeWidth={2.5} />
    </span>
  );
}

export { VerificationIcon };
