import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BadgeCheck, CircleCheck } from "lucide-react";

import heroImage from "@/assets/home/hero.jpg";
import { BTN_DARK, BTN_LG, BTN_OUTLINE, CONTAINER, SAMPLE_TAG } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// The hero follows Homepage v6 in the Oct 2026 draft (itself modelled on
// blinq.me): a centred headline, then a wide rounded "stage" that runs past
// the bottom of the first screen so the page visibly continues. Floating
// cards around the stage come from Homepage v5.
//
// The stage plays HERO_VIDEO when one is set and shows the photo until then.
// Drop an mp4 in src/assets/home/ and import it here to switch it on.
const HERO_VIDEO = null;

// Illustrative entries for the "Just claimed" card, labelled "Sample". The
// names are made up on purpose and meant to read that way ("contoh" is Malay
// for "example") — none of them is a business in the directory.
const SAMPLE_CLAIMS = [
  { initials: "CA", name: "Contoh Accounting Sdn Bhd", area: "Accounting · Kuala Lumpur" },
  { initials: "SL", name: "Sampel Logistik Sdn Bhd", area: "Logistics · Penang" },
  { initials: "ET", name: "Example Tech Solutions", area: "IT services · Johor Bahru" },
  { initials: "CL", name: "Contoh Legal & Associates", area: "Legal · Petaling Jaya" },
  { initials: "DM", name: "Demo Marketing Studio", area: "Marketing · Kota Kinabalu" },
];

// A floating card. The three of them bob out of step with each other.
const BUBBLE =
  "absolute z-10 rounded-[20px] bg-white p-4 text-left text-ink shadow-[0_18px_50px_rgba(20,20,19,0.16),0_2px_6px_rgba(20,20,19,0.06)] motion-safe:animate-[abri-float_7s_ease-in-out_infinite] dark:bg-card dark:text-foreground";

const AVATAR = "grid flex-none place-items-center font-display font-bold";

function VerifiedPill() {
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-yellow px-2.5 py-0.5 text-[12px] font-bold text-ink">
      <BadgeCheck className="size-3.5" aria-hidden />
      ABRI Verified
    </span>
  );
}

// Bottom left: what a verified profile looks like.
function ProfileBubble() {
  return (
    <div className={cn(BUBBLE, "bottom-20 left-3 w-[230px] sm:bottom-32 sm:w-[310px] lg:-left-9")} aria-hidden>
      <div className="flex items-center gap-3">
        <span className={cn(AVATAR, "size-[46px] rounded-[14px] bg-ink text-[18px] text-yellow")}>C</span>
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] leading-tight font-bold">Contoh Trading Sdn Bhd</p>
          <p className="text-[13px] text-grey-600 dark:text-muted-foreground">Trading · Kuala Lumpur</p>
          <VerifiedPill />
        </div>
      </div>
      <div className="mt-3.5 hidden gap-2 border-t border-grey-200 pt-3 sm:flex dark:border-border">
        {[
          ["3", "endorsements"],
          ["2", "intros made"],
          ["Active", "with SSM"],
        ].map(([value, label]) => (
          <span key={label} className="flex-1 rounded-[10px] bg-surface-2 px-2.5 py-2 text-[12px] leading-tight text-grey-600 dark:bg-muted dark:text-muted-foreground">
            <b className="block font-display text-[16px] text-ink dark:text-foreground">{value}</b>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Top right: the rotating "Just claimed" card that used to sit under the old hero copy.
function ClaimBubble() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(timer);
  }, []);

  const claim = SAMPLE_CLAIMS[tick % SAMPLE_CLAIMS.length];

  return (
    <div
      className={cn(BUBBLE, "top-3 right-3 w-[230px] [animation-delay:-2.3s] sm:top-16 sm:w-[310px] lg:-right-9")}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="relative size-2 rounded-full bg-yellow-hi" aria-hidden>
          <span className="absolute -inset-1 animate-ping rounded-full border-2 border-yellow" />
        </span>
        <span className="text-[13px] font-bold sm:text-[14px]">Just claimed on ABRI</span>
        <span className={cn("ml-auto hidden sm:inline", SAMPLE_TAG)}>Sample</span>
      </div>
      <div key={tick} className="mt-2.5 flex animate-in items-center gap-2.5 duration-500 fade-in slide-in-from-top-1">
        <span className={cn(AVATAR, "size-9 rounded-full bg-ink text-[12px] text-yellow")} aria-hidden>
          {claim.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{claim.name}</p>
          <p className="truncate text-[12px] text-grey-600 dark:text-muted-foreground">{claim.area} · Just now</p>
        </div>
        <CircleCheck className="hidden size-4 flex-none text-yellow-hi sm:block" aria-hidden />
      </div>
    </div>
  );
}

// Bottom right, just above the industry ribbon: an introduction landing.
function IntroBubble() {
  return (
    <div className={cn(BUBBLE, "right-14 bottom-32 hidden w-[330px] [animation-delay:-4.6s] lg:block")} aria-hidden>
      <div className="flex items-center gap-3">
        <div className="flex">
          <span className={cn(AVATAR, "size-9 rounded-full border-[3px] border-white bg-ink text-[13px] text-yellow dark:border-card")}>
            CT
          </span>
          <span className={cn(AVATAR, "-ml-3 size-9 rounded-full border-[3px] border-white bg-yellow text-[13px] text-ink dark:border-card")}>
            SL
          </span>
        </div>
        <div>
          <p className="font-display text-[15px] leading-tight font-bold">Introduction accepted</p>
          <p className="text-[13px] leading-snug text-grey-600 dark:text-muted-foreground">
            Contoh Trading introduced you to Sampel Logistik
          </p>
        </div>
      </div>
    </div>
  );
}

// Grows from 94% to full width over the first screen of scrolling, so the
// stage reads as coming towards the reader. Skipped under reduced motion.
function useScrollGrow() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.6)));
      el.style.transform = `scale(${0.94 + 0.06 * progress})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}

function Hero() {
  const stageRef = useScrollGrow();

  return (
    <header className="overflow-x-clip pt-12 text-center sm:pt-[72px]">
      <div className={CONTAINER}>
        <div className="animate-in duration-700 fade-in slide-in-from-bottom-3">
          <span className="inline-flex items-center gap-2.5 rounded-full bg-yellow-soft py-2 pr-4 pl-2.5 text-[14px] font-semibold text-ink dark:bg-yellow/15 dark:text-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow px-2 py-0.5 text-[12px] font-bold text-ink">
              <BadgeCheck className="size-3.5" aria-hidden />
              Verified
            </span>
            Malaysia’s verified business network
          </span>

          <h1 className="mx-auto mt-6 max-w-[980px] font-display text-[44px] leading-[1.02] font-bold tracking-[-0.04em] text-ink sm:text-[64px] lg:text-[84px] dark:text-foreground">
            Do business with people{" "}
            <span className="bg-[linear-gradient(transparent_82%,var(--yellow)_82%)] px-[0.04em]">you can trust.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[620px] text-[18px] leading-[1.55] text-grey-600 sm:text-[20px] dark:text-muted-foreground">
            Find partners, build trust and discover opportunities.
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/register" className={cn(BTN_DARK, BTN_LG)}>
              Join ABRI free
              <ArrowUpRight className="size-[18px]" aria-hidden />
            </Link>
            <Link to="/register" className={cn(BTN_OUTLINE, BTN_LG)}>
              Claim your business
              <ArrowRight className="size-[18px]" aria-hidden />
            </Link>
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-grey-600 dark:text-muted-foreground">
            <span className="size-2 rounded-full bg-yellow" aria-hidden />
            Free to join. Opportunities await.
          </p>
        </div>

        <div ref={stageRef} className="relative mx-auto mt-14 max-w-[1120px] origin-top will-change-transform">
          <div className="h-[420px] overflow-hidden rounded-[28px] bg-surface-2 sm:h-[580px] sm:rounded-[40px] dark:bg-muted">
            {HERO_VIDEO ? (
              <video
                src={HERO_VIDEO}
                poster={heroImage}
                autoPlay
                muted
                loop
                playsInline
                className="size-full object-cover object-[center_45%]"
              />
            ) : (
              <img
                src={heroImage}
                alt="Malaysian professionals connecting over a business conversation in Kuala Lumpur"
                className="size-full object-cover object-[center_45%]"
              />
            )}
          </div>
          <ProfileBubble />
          <ClaimBubble />
          <IntroBubble />
        </div>
      </div>
    </header>
  );
}

export { Hero };
