import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, CircleCheck, Search } from "lucide-react";

import heroImage from "@/assets/home/hero.jpg";
import { IndustryTicker } from "@/components/sections/IndustryTicker";
import { NetworkBackground } from "@/components/sections/NetworkBackground";
import { hasSignedInBefore } from "@/lib/returningVisitor";
import { SAMPLE_TAG } from "@/components/sections/marketing";
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
  {
    initials: "CA",
    name: "Contoh Accounting Sdn Bhd",
    area: "Accounting · Kuala Lumpur",
  },
  {
    initials: "SL",
    name: "Sampel Logistik Sdn Bhd",
    area: "Logistics · Penang",
  },
  {
    initials: "ET",
    name: "Example Tech Solutions",
    area: "IT services · Johor Bahru",
  },
  {
    initials: "CL",
    name: "Contoh Legal & Associates",
    area: "Legal · Petaling Jaya",
  },
  {
    initials: "DM",
    name: "Demo Marketing Studio",
    area: "Marketing · Kota Kinabalu",
  },
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
    <div
      className={cn(BUBBLE, "bottom-32 -left-9 hidden w-[310px] lg:block")}
      aria-hidden
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            AVATAR,
            "size-[46px] rounded-[14px] bg-ink text-[18px] text-yellow",
          )}
        >
          C
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] leading-tight font-bold">
            Contoh Trading Sdn Bhd
          </p>
          <p className="text-[13px] text-grey-600 dark:text-muted-foreground">
            Trading · Kuala Lumpur
          </p>
          <VerifiedPill />
        </div>
      </div>
      <div className="mt-3.5 hidden gap-2 border-t border-grey-200 pt-3 sm:flex dark:border-border">
        {[
          ["3", "endorsements"],
          ["2", "intros made"],
          ["Active", "with SSM"],
        ].map(([value, label]) => (
          <span
            key={label}
            className="flex-1 rounded-[10px] bg-surface-2 px-2.5 py-2 text-[12px] leading-tight text-grey-600 dark:bg-muted dark:text-muted-foreground"
          >
            <b className="block font-display text-[16px] text-ink dark:text-foreground">
              {value}
            </b>
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
      className={cn(
        BUBBLE,
        "top-16 -right-9 hidden w-[310px] [animation-delay:-2.3s] lg:block",
      )}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="relative size-2 rounded-full bg-yellow-hi" aria-hidden>
          <span className="absolute -inset-1 animate-ping rounded-full border-2 border-yellow" />
        </span>
        <span className="text-[13px] font-bold sm:text-[14px]">
          Just claimed on ABRI
        </span>
        <span className={cn("ml-auto hidden sm:inline", SAMPLE_TAG)}>
          Sample
        </span>
      </div>
      <div
        key={tick}
        className="mt-2.5 flex animate-in items-center gap-2.5 duration-500 fade-in slide-in-from-top-1"
      >
        <span
          className={cn(
            AVATAR,
            "size-9 rounded-full bg-ink text-[12px] text-yellow",
          )}
          aria-hidden
        >
          {claim.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{claim.name}</p>
          <p className="truncate text-[12px] text-grey-600 dark:text-muted-foreground">
            {claim.area} · Just now
          </p>
        </div>
        <CircleCheck
          className="hidden size-4 flex-none text-yellow-hi sm:block"
          aria-hidden
        />
      </div>
    </div>
  );
}

// Bottom right, just above the industry ribbon: an introduction landing.
function IntroBubble() {
  return (
    <div
      className={cn(
        BUBBLE,
        "right-14 bottom-32 hidden w-[330px] [animation-delay:-4.6s] lg:block",
      )}
      aria-hidden
    >
      <div className="flex items-center gap-3">
        <div className="flex">
          <span
            className={cn(
              AVATAR,
              "size-9 rounded-full border-[3px] border-white bg-ink text-[13px] text-yellow dark:border-card",
            )}
          >
            CT
          </span>
          <span
            className={cn(
              AVATAR,
              "-ml-3 size-9 rounded-full border-[3px] border-white bg-yellow text-[13px] text-ink dark:border-card",
            )}
          >
            SL
          </span>
        </div>
        <div>
          <p className="font-display text-[15px] leading-tight font-bold">
            Introduction accepted
          </p>
          <p className="text-[13px] leading-snug text-grey-600 dark:text-muted-foreground">
            Contoh Trading introduced you to Sampel Logistik
          </p>
        </div>
      </div>
    </div>
  );
}

// The search from Homepage v3, in the place blinq.me keeps its two buttons:
// one field and a gold button in a white box (white in both themes, as V3
// sets it on a dark hero). No "Try" chips: the moving row of industries under
// it does that job. It hands off to /directory, which matches names,
// industries, SSM numbers and websites from ?q=.
function HeroSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");


  return (
    <div className="mx-auto grid w-full max-w-[42rem] justify-items-center gap-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          navigate(q ? `/directory?q=${encodeURIComponent(q)}` : "/directory");
        }}
        className="flex w-full gap-1.5 rounded-xl border border-grey-200 bg-white p-1 min-[480px]:gap-2 min-[480px]:p-2 shadow-[0_12px_40px_rgba(17,24,39,0.08)] dark:border-transparent dark:shadow-none"
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 pl-2 text-grey-600 min-[480px]:gap-2.5 min-[480px]:pl-3">
          <Search className="size-[18px] flex-none" aria-hidden />
          <span className="sr-only">Search businesses</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Company or industry"
            autoComplete="off"
            className="h-10 w-full min-w-0 border-0 bg-transparent text-[15px] text-ink min-[480px]:h-[52px] min-[480px]:text-[1.0625rem] outline-none placeholder:text-grey-500"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-yellow px-4 text-[14px] min-[480px]:h-[52px] min-[480px]:text-[15px] font-bold whitespace-nowrap text-ink transition-all duration-150 hover:-translate-y-px hover:bg-yellow-hi min-[480px]:px-[22px]"
        >
          Search
        </button>
      </form>


      <p className="text-[13px] text-grey-600 min-[480px]:text-[14px] dark:text-muted-foreground">
        Run a business?{" "}
        <Link
          to="/register"
          className="inline-flex items-center gap-1 font-semibold text-ink underline decoration-yellow decoration-2 underline-offset-4 hover:decoration-yellow-hi dark:text-foreground"
        >
          Claim your business
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}

// Linear's load-in, measured frame by frame on linear.app (Nov 2026):
//  - the headline comes in as whole LINES, not words, about 50ms apart;
//  - each line goes from invisible and 10px blurred to sharp, the blur
//    clearing in step with the fade, with no movement;
//  - a smooth cubic ease-out over about one second;
//  - nothing starts until the web fonts are ready, so no line redraws in a
//    different font halfway through;
//  - the sub-copy, search and row below are there from the start;
//  - the photo / video fades in, opacity only, after the headline has
//    landed, and never before its file has loaded: a fade that runs before
//    the image arrives ends with it popping in at full strength. Linear's
//    image reaches half strength ~275ms in and eases out over ~1.3s.
// Written out in full (cubic ease-out) so Tailwind can see the class name.
const LINE_IN = "motion-safe:animate-[abri-blur-in_1000ms_cubic-bezier(0.33,1,0.68,1)_backwards]";
const LINE_STEP = 50; // ms between the label and each headline line
const MEDIA_DELAY = 900; // ms after the fonts are ready: the headline has landed
const MEDIA_IN = "motion-safe:animate-[abri-fade-in_1300ms_cubic-bezier(0.33,1,0.68,1)_backwards]";

// When the hero photo (or video) finished loading (a performance.now() time),
// or null before, so its fade never runs ahead of the file. Gives up waiting
// after 4s and shows it regardless.
function useMediaLoadedAt() {
  const ref = useRef(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const markLoaded = () => setLoadedAt((t) => t ?? performance.now());
  useEffect(() => {
    const el = ref.current;
    // Already loaded (from cache) before React attached the handler.
    const frame = requestAnimationFrame(() => {
      if (el && (el.complete || el.readyState >= 2)) markLoaded();
    });
    const timer = setTimeout(markLoaded, 4000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  return [ref, loadedAt, markLoaded];
}

// True once the hero's fonts have loaded, or after 800ms regardless so a slow
// font never holds the page back. Until then the animated pieces wait,
// invisible (only for visitors who allow motion).
// Returns when that happened (a performance.now() time), or null before.
function useFontsReady() {
  const [readyAt, setReadyAt] = useState(null);
  useEffect(() => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        setReadyAt(performance.now());
      }
    };
    const timer = setTimeout(go, 800);
    if (document.fonts?.ready) document.fonts.ready.then(go);
    else go();
    return () => clearTimeout(timer);
  }, []);
  return readyAt;
}

function Hero() {
  const readyAt = useFontsReady();
  const ready = readyAt !== null;
  const [mediaRef, mediaLoadedAt, onMediaLoad] = useMediaLoadedAt();
  // Each animated piece is held invisible until the fonts are ready, then
  // plays its entrance with the given delay.
  const enter = (animation, delay) => ({
    className: ready ? animation : "motion-safe:opacity-0",
    style: ready ? { animationDelay: `${delay}ms` } : undefined,
  });
  const label = enter(LINE_IN, 0);
  const line1 = enter(LINE_IN, LINE_STEP);
  const line2 = enter(LINE_IN, LINE_STEP * 2);
  // First visit on this device: the cascade carries on down through the
  // sub-copy, search and moving row. Someone who has signed in here before
  // gets those three from the first frame (as Linear does), so the search is
  // ready the moment they land; the headline and photo still play.
  const [firstVisit] = useState(() => !hasSignedInBefore());
  const still = { className: undefined, style: undefined };
  const subCopy = firstVisit ? enter(LINE_IN, LINE_STEP * 3) : still;
  const search = firstVisit ? enter(LINE_IN, LINE_STEP * 4) : still;
  const row = firstVisit ? enter(LINE_IN, LINE_STEP * 5) : still;
  const network = enter(MEDIA_IN, MEDIA_DELAY);
  // The photo waits for both the fonts and its own file. If the file came
  // late, it uses only what is left of the usual delay, so it fades in as
  // soon as it arrives rather than popping in.
  const photo =
    ready && mediaLoadedAt !== null
      ? {
          className: MEDIA_IN,
          style: { animationDelay: `${Math.round(Math.max(0, MEDIA_DELAY - Math.max(0, mediaLoadedAt - readyAt)))}ms` },
        }
      : { className: "motion-safe:opacity-0", style: undefined };

  return (
    // Spacing, type and video sizes are blinq.me's hero, in rem as theirs
    // are so the two scale alike: 5rem above (4.5rem on a phone), side
    // padding 8rem from 992px, 2rem below that, 1.5rem on a phone, and 3rem
    // between each block.
    <header className="relative isolate overflow-x-clip px-[17px] pt-[50px] text-center min-[480px]:px-8 min-[480px]:pt-20 min-[992px]:px-32">
      <NetworkBackground className={network.className} style={network.style} />
      {/* Blinq's 3rem gaps from 480px up. Below 480px, Blinq's phone layout
          as measured at 390px: 17px sides, 50px above, a 42px headline, 14px
          sub-copy, 28px between blocks, a 45px-tall action row, 21px video
          corners, so the whole video sits on the first screen. */}
      <div className="mx-auto grid max-w-[120rem] grid-cols-[minmax(0,1fr)] gap-7 min-[480px]:gap-12">
        <div className="grid gap-7 min-[480px]:gap-12">
          <div className="grid justify-items-center gap-4 min-[480px]:gap-5">
            <span
              style={label.style}
              className={cn(
                label.className,
                "inline-flex items-center gap-2 rounded-full bg-yellow-soft py-1.5 pr-3.5 pl-2 text-[13px] font-semibold whitespace-nowrap text-ink sm:gap-2.5 sm:py-2 sm:pr-4 sm:pl-2.5 sm:text-[14px] dark:bg-yellow/15 dark:text-foreground",
              )}
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow px-2 py-0.5 text-[12px] font-bold text-ink">
                <BadgeCheck className="size-3.5" aria-hidden />
                <span className="max-[399px]:sr-only">Verified</span>
              </span>
              Malaysia’s verified business network
            </span>
            <h1 className="mx-auto w-[80%] font-display text-[42px] leading-none font-semibold tracking-[-0.03em] text-ink min-[480px]:w-3/4 min-[480px]:text-[4.5rem] min-[768px]:w-[65%] min-[992px]:w-auto min-[992px]:max-w-[52rem] dark:text-foreground">
              <span className={cn("block", line1.className)} style={line1.style}>
                Do business with people
              </span>
              <span className={cn("inline-block", line2.className)} style={line2.style}>
                <span className="bg-[linear-gradient(transparent_82%,var(--yellow)_82%)] px-[0.04em]">you can trust.</span>
              </span>
            </h1>
          </div>

          <div className="mx-auto grid w-full max-w-[50rem] gap-7 min-[480px]:gap-8">
            <p
              className={cn("mx-auto w-[85%] text-[14px] leading-[1.35] text-grey-600 min-[480px]:w-auto min-[480px]:text-[1.25rem] dark:text-muted-foreground", subCopy.className)}
              style={subCopy.style}
            >
              Find partners, build trust and discover opportunities.
            </p>
            <div className={search.className} style={search.style}>
              <HeroSearch />
            </div>
          </div>

          {/* 2rem above the row rather than the hero's usual 3rem. */}
          <div className={cn("min-w-0 min-[480px]:-mt-4", row.className)} style={row.style}>
            <IndustryTicker />
          </div>
        </div>

        {/* blinq.me's hero video box: always 16:9; full width up to 90rem
            from 992px, three quarters and centred from 768px to 991px, full
            width below 768px; corners 50px, 30px on a phone. */}
        <div
          className={cn("relative mx-auto w-full max-w-[90rem] min-[768px]:max-[991px]:w-3/4", photo.className)}
          style={photo.style}
        >
          <div className="aspect-video overflow-hidden rounded-[21px] bg-surface-2 min-[480px]:rounded-[3.125rem] dark:bg-muted">
            {HERO_VIDEO ? (
              <video
                ref={mediaRef}
                onLoadedData={onMediaLoad}
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
                ref={mediaRef}
                onLoad={onMediaLoad}
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
