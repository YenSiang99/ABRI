import { Link } from "react-router-dom";

import worldMap from "@/assets/home/world-map.png";
import { Eyebrow } from "@/components/sections/Eyebrow";
import { BTN_PRIMARY, CONTAINER, SECTION_PB } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

function FinalCta() {
  return (
    <section id="claim" className={SECTION_PB}>
      <div className={CONTAINER}>
        <div className="relative overflow-hidden rounded-lg bg-ink px-6 py-12 text-white md:px-12 md:py-[72px] dark:border dark:border-border dark:bg-card">
          {/* The map is drawn in dark dots; inverted, it reads as a faint
              light texture on the ink panel. */}
          <img
            src={worldMap}
            alt=""
            aria-hidden
            className="pointer-events-none absolute top-1/2 -right-40 w-[560px] -translate-y-1/2 opacity-15 invert lg:right-8 lg:max-w-[44%]"
          />
          <div className="relative">
            <Eyebrow className="text-[#a5a198] dark:text-[#a5a198]">Make your next connection count</Eyebrow>
            <h2 className="mt-3 max-w-[650px] text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-white">
              Your next big business connection could start right here.
            </h2>
            <p className="mt-3.5 max-w-[46ch] text-[#a5a198]">
              Build your profile. Grow your credibility. Meet businesses ready to move forward, together.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-5">
              <Link to="/register" className={cn(BTN_PRIMARY, "px-7 py-[15px] text-base")}>
                Join ABRI
              </Link>
              <span className="font-mono text-[12.5px] text-[#8a857a]">Built on trust. Open to possibility.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export { FinalCta };
