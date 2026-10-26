import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck } from "lucide-react";

import heroImage from "@/assets/home/hero.jpg";
import { BTN_OUTLINE_ON_DARK, BTN_PRIMARY, CONTAINER, SAMPLE_TAG } from "@/components/sections/marketing";

// Illustrative entries for the "Just claimed" ticker, labelled "Sample" on the
// card. The names are made up on purpose and meant to read that way ("contoh"
// is Malay for "example") — none of them is a business in the directory.
const SAMPLE_CLAIMS = [
  { initials: "CA", name: "Contoh Accounting Sdn Bhd", area: "Accounting · Kuala Lumpur" },
  { initials: "SL", name: "Sampel Logistik Sdn Bhd", area: "Logistics · Penang" },
  { initials: "ET", name: "Example Tech Solutions", area: "IT services · Johor Bahru" },
  { initials: "CL", name: "Contoh Legal & Associates", area: "Legal · Petaling Jaya" },
  { initials: "DM", name: "Demo Marketing Studio", area: "Marketing · Kota Kinabalu" },
];

function ClaimTicker() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 3500);
    return () => clearInterval(timer);
  }, []);

  const claim = SAMPLE_CLAIMS[tick % SAMPLE_CLAIMS.length];

  return (
    <div
      className="mt-[26px] max-w-[420px] rounded-lg border border-grey-200 bg-white p-4 text-ink shadow-md dark:border-border dark:bg-card dark:text-foreground"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="size-1.5 animate-pulse rounded-full bg-yellow" aria-hidden />
        <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
          Just claimed on ABRI
        </span>
        <span className={`ml-auto ${SAMPLE_TAG}`}>Sample</span>
      </div>
      <div
        key={tick}
        className="mt-3 flex animate-in items-center gap-3 duration-500 fade-in slide-in-from-top-1"
      >
        <span
          className="grid size-9 flex-none place-items-center rounded-xl bg-ink text-[13px] font-extrabold text-yellow dark:bg-grey-700"
          aria-hidden
        >
          {claim.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold">{claim.name}</p>
          <p className="mt-0.5 text-[13px] text-grey-600 dark:text-muted-foreground">{claim.area} · Just now</p>
        </div>
        <CircleCheck className="size-4 flex-none text-yellow" aria-hidden />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <header className="relative isolate overflow-hidden text-white">
      <img
        src={heroImage}
        alt="Malaysian professionals connecting over a business conversation in Kuala Lumpur"
        className="absolute inset-0 -z-20 size-full object-cover object-[64%_center] sm:object-[center_54%]"
      />
      {/* Dark on the left where the copy sits, clearing to the photo on the
          right. On a phone the copy covers the whole width, so the shade does too. */}
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(17,17,17,0.92),rgba(17,17,17,0.6))] sm:bg-[linear-gradient(90deg,rgba(17,17,17,0.9)_0%,rgba(17,17,17,0.74)_33%,rgba(17,17,17,0.18)_69%,rgba(17,17,17,0.06)_100%)]"
        aria-hidden
      />

      <div className={CONTAINER}>
        <div className="max-w-[570px] animate-in pt-16 pb-16 duration-700 fade-in slide-in-from-bottom-3 md:pt-24 md:pb-28">
          <h1 className="text-[clamp(40px,5.2vw,62px)] leading-[1.06] font-extrabold tracking-[-0.028em] text-white">
            Where Businesses
            <br />
            Connect and Grow
          </h1>
          <p className="mt-[22px] max-w-[30rem] text-[19px] text-grey-300">
            Find partners, build trust and discover opportunities.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className={BTN_OUTLINE_ON_DARK}>
              Join ABRI
            </Link>
            <Link to="/register" className={BTN_PRIMARY}>
              Claim your business
            </Link>
          </div>
          <div className="mt-[26px] flex items-center gap-2.5 text-[13px] text-grey-300">
            <CircleCheck className="size-4 text-yellow" aria-hidden />
            Free to join. Opportunities await.
          </div>
          <ClaimTicker />
        </div>
      </div>
    </header>
  );
}

export { Hero };
