import { FileText, Check, Star, Circle, UserCheck, ShieldCheck } from "lucide-react";
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
        T3: "bg-ink text-yellow",
        T4: "bg-ink text-yellow",
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
  T3: ShieldCheck,
  T4: Star,
};
const TIER_LABEL = {
  registered: "SSM Registered",
  verified: "SSM-Verified",
  trusted: "Trusted Business",
  T0: "Unclaimed",
  T1: "Claimed",
  T2: "SSM-Verified",
  T3: "Identity-Verified",
  T4: "Transaction-Trusted",
};
const TIER_SUBTITLE = {
  T0: "Not yet claimed by an owner",
  T1: "Owner confirmed, pending SSM check",
  T2: "Matched against official SSM records",
  T3: "Representative identity verified",
  T4: "Proven transaction history",
};
const SIZE_ICON_CLASS = {
  inline: "w-3 h-3",
  profile: "w-3 h-3",
  hero: "w-10 h-10",
};

function VerificationBadge({ tier, size = "profile", subtitle, chip = false, className }) {
  let Icon = TIER_ICON[tier];
  let TierLabel = TIER_LABEL[tier];
  let Subtitle = subtitle ?? TIER_SUBTITLE[tier] ?? "";

  const content = (
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
  );

  if (!chip) return content;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-ink bg-white px-2.5 py-1.5",
        className,
      )}
    >
      {content}
    </span>
  );
}

export { VerificationBadge };
