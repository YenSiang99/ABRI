import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import worldMap from "@/assets/home/world-map.png";
import { Eyebrow } from "@/components/sections/Eyebrow";
import { BTN_DARK, BTN_LG, CONTAINER, H2 } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// The closing card from Homepage v6: a rounded gold panel inside the page
// width, the dotted world map faded in behind it.
function FinalCta() {
  return (
    <section id="claim" className={cn(CONTAINER, "py-16 md:py-24")}>
      <div className="relative flex flex-wrap items-center justify-between gap-7 overflow-hidden rounded-[32px] bg-yellow px-6 py-11 text-ink sm:rounded-[40px] sm:px-14 sm:py-16">
        <img
          src={worldMap}
          alt=""
          aria-hidden
          className="pointer-events-none absolute top-1/2 -right-10 hidden w-[460px] max-w-none -translate-y-1/2 opacity-30 lg:block"
        />
        <div className="relative max-w-[620px]">
          <Eyebrow className="text-ink dark:text-ink">Make your next connection count</Eyebrow>
          <h2 className={cn(H2, "text-ink dark:text-ink")}>Your next big business connection could start right here.</h2>
          <p className="mt-3 text-[17px] leading-[1.6] text-[#1F2937]">
            Build your profile. Grow your credibility. Meet businesses ready to move forward, together.
          </p>
        </div>
        <Link to="/register" className={cn(BTN_DARK, BTN_LG, "relative dark:bg-ink dark:text-white dark:hover:bg-black")}>
          Join ABRI free
          <ArrowUpRight className="size-[18px]" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

export { FinalCta };
