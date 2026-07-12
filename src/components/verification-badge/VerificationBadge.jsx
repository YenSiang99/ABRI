import { FileText, Check, Star, Circle, UserCheck } from "lucide-react";
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
        T0: "bg-transparent border border-dashed border-grey-300 text-grey-500",
        T1: "bg-grey-100 text-grey-600",
        T2: "bg-yellow",
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
  T0: Circle,
  T1: UserCheck,
  T2: Check,
};
const TIER_LABEL = {
  registered: "SSM Registered",
  verified: "SSM-Verified",
  trusted: "Trusted Business",
  T0: "Unclaimed",
  T1: "Claimed",
  T2: "SSM-Verified",
};
const TIER_SUBTITLE = {
  T0: "Not yet claimed by an owner",
  T1: "Owner confirmed, pending SSM check",
  T2: "Matched against official SSM records",
};
const SIZE_ICON_CLASS = {
  inline: "w-3 h-3",
  profile: "w-3 h-3",
  hero: "w-10 h-10",
};

function VerificationBadge({ tier, size = "profile", subtitle }) {
  let Icon = TIER_ICON[tier];
  let TierLabel = TIER_LABEL[tier];
  let Subtitle = subtitle ?? TIER_SUBTITLE[tier] ?? "";

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
            <span className="text-xs text-grey-500 mt-0.5">{Subtitle}</span>
          </span>
        )}
      </span>
    </>
  );
}

export { VerificationBadge };
