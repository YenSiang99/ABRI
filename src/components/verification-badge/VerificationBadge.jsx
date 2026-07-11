import { FileText, Check, Star } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const markVariants = cva(
  "rounded-full flex items-center justify-center flex-none",
  {
    variants: {
      tier: {
        registered: "bg-grey-100 text-black",
        verified: "bg-yellow ",
        trusted: "bg-ink text-yellow",
      },
      size: {
        inline: "w-[18px] h-[18px]",
        profile: "w-[18px] h-[18px] ",
        hero: "w-[84px] h-[84px]",
      },
    },
  },
);
const TIER_ICON = {
  registered: FileText,
  verified: Check,
  trusted: Star,
};
const TIER_LABEL = {
  registered: "SSM Registered",
  verified: "SSM-Verified",
  trusted: "Trusted Business",
};
const SIZE_ICON_CLASS = {
  inline: "w-3 h-3",
  profile: "w-3 h-3",
  hero: "w-10 h-10",
};

function VerificationBadge({ tier, size = "profile", subtitle = "" }) {
  let Icon = TIER_ICON[tier];
  let TierLabel = TIER_LABEL[tier];

  return (
    <>
      <span className="flex items-center gap-2">
        <span className={cn(markVariants({ tier, size }))}>
          <Icon className={SIZE_ICON_CLASS[size]} />
        </span>
        {size === "inline" ? (
          <span className="text-xs font-bold">{TierLabel}</span>
        ) : (
          <span className="flex flex-col">
            <span className="text-sm font-bold leading-tight">{TierLabel}</span>
            <span className="text-xs text-grey-500 mt-0.5">{subtitle}</span>
          </span>
        )}
      </span>
    </>
  );
}

export { VerificationBadge };
