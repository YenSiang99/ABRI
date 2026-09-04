import { Check, Circle, UserCheck, ShieldCheck, Star } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { verificationLevelLabel } from "@/lib/trustLabels";
import { UNCLAIMED } from "@/lib/verificationLevels";

// The VERIFICATION LEVEL badge — L0-L4, one of the two EARNED axes.
//
// Keyed only by levels. It used to hold the marketing marks
// ("registered"/"verified"/"trusted") in the SAME cva variant and the SAME
// icon map, so one object answered to two vocabularies and Hero.jsx passed a
// marketing value through the level badge. Those three now live in
// VerificationIcon.jsx under a `mark` prop.
//
// The label comes from lib/trustLabels.js rather than a local map: there used
// to be three copies of it and they disagreed about L0 ("Listed" here,
// "Unclaimed" there).

const markVariants = cva(
  "rounded-full flex items-center justify-center flex-none",
  {
    variants: {
      verificationLevel: {
        L0: "bg-transparent border border-dashed border-grey-300 text-grey-500 dark:border-border dark:text-muted-foreground",
        L1: "bg-grey-100 text-grey-600 dark:bg-grey-700 dark:text-muted-foreground",
        L2: "bg-yellow",
        L3: "bg-ink text-yellow dark:bg-grey-700",
        L4: "bg-ink text-yellow dark:bg-grey-700",
      },
      size: {
        inline: "w-[18px] h-[18px]",
        profile: "w-[18px] h-[18px] ",
        hero: "w-[84px] h-[84px]",
      },
    },
  },
);
const VERIFICATION_LEVEL_ICON = {
  L0: Circle,
  L1: UserCheck,
  L2: Check,
  L3: ShieldCheck,
  L4: Star,
};
const VERIFICATION_LEVEL_SUBTITLE = {
  L0: "Not yet claimed by an owner",
  L1: "Owner confirmed, pending SSM check",
  L2: "Matched against official SSM records",
  L3: "Representative identity verified",
  L4: "Proven transaction history",
};
const SIZE_ICON_CLASS = {
  inline: "w-3 h-3",
  profile: "w-3 h-3",
  hero: "w-10 h-10",
};

function VerificationBadge({ verificationLevel, size = "profile", subtitle, chip = false, className }) {
  // Falls back rather than indexing blind — see the same guard in
  // VouchBadge.jsx. `VERIFICATION_LEVEL_ICON[unknown]` is undefined and rendering that as
  // a component throws, taking the route with it; an unrecognised value has
  // to degrade to a neutral mark, never to a white screen.
  //
  // The label falls back to the RAW VALUE rather than to a friendly string.
  // If this badge is ever handed something it doesn't know, showing the code
  // is honest and debuggable; showing "Listed" would be inventing a status.
  let Icon = VERIFICATION_LEVEL_ICON[verificationLevel] ?? VERIFICATION_LEVEL_ICON[UNCLAIMED];
  let LevelLabel = verificationLevelLabel[verificationLevel] ?? verificationLevel ?? "";
  let Subtitle = subtitle ?? VERIFICATION_LEVEL_SUBTITLE[verificationLevel] ?? "";

  const content = (
    <span className="flex items-center gap-2">
      <span className={cn(markVariants({ verificationLevel, size }))}>
        <Icon className={SIZE_ICON_CLASS[size]} />
      </span>
      {size === "inline" ? (
        <span className="text-xs font-bold dark:text-foreground">{LevelLabel}</span>
      ) : (
        <span className="flex flex-col">
          <span className="text-sm font-bold leading-tight dark:text-foreground">{LevelLabel}</span>
          <span className="text-xs text-grey-500 mt-0.5 dark:text-muted-foreground">{Subtitle}</span>
        </span>
      )}
    </span>
  );

  if (!chip) return content;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-ink bg-white px-2.5 py-1.5 dark:border-grey-600 dark:bg-card",
        className,
      )}
    >
      {content}
    </span>
  );
}

// VERIFICATION_LEVEL_SUBTITLE is exported for components/badge/BadgeExplainer.jsx,
// which lists every rung with a one-line meaning beside it. Deliberately the
// SAME strings this badge already renders at size="profile" rather than a
// second set written for the explainer: a member who reads "Matched against
// official SSM records" under the mark and then taps it must not be shown a
// paraphrase of the same fact.
export { VerificationBadge, VERIFICATION_LEVEL_SUBTITLE };
