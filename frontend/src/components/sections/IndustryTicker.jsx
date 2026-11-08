import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck } from "lucide-react";

import { fetchDirectoryFacets, fetchPublicStats } from "@/lib/api/businesses";
import { BUSINESS_CATEGORIES } from "@/lib/businessVocab";
import { cn } from "@/lib/utils";

// Malaysia's MSME count, a fixed national figure (from the homepage draft),
// not something ABRI measures. The other two numbers are live from
// GET /businesses/stats.
const MALAYSIA_MSMES = 1069831;

const format = (n) => n.toLocaleString("en-MY");

// The quiet, always-moving row under the hero search, where blinq.me puts its
// ratings row. It carries ABRI's numbers (it replaced the stats strip that
// sat under the hero) among the directory's categories, busiest first, each opening the directory filtered to it. Until the facets
// load (or if they fail) it shows the full category list, the same vocabulary
// the server accepts; a live number that fails to load is left out.
// Pixels per second the row travels.
const SPEED = 32;

// Slides the track left forever, looping after one copy's width. Driven from
// JavaScript rather than a CSS animation so every step lands on a whole device
// pixel: a CSS animation moves text by fractions of a pixel, and the browser
// then draws it as a soft, blurry image while it moves. Paused while the
// pointer or keyboard focus is on the row, and still under reduced motion.
function useMarquee() {
  const trackRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let x = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (!pausedRef.current) {
        const loop = track.scrollWidth / 2;
        x -= SPEED * dt;
        if (loop > 0 && -x >= loop) x += loop;
        const dpr = window.devicePixelRatio || 1;
        track.style.transform = `translateX(${Math.round(x * dpr) / dpr}px)`;
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };
  return { trackRef, handlers: { onMouseEnter: pause, onMouseLeave: resume, onFocus: pause, onBlur: resume } };
}

function IndustryTicker({ className }) {
  const [categories, setCategories] = useState(BUSINESS_CATEGORIES);
  const [stats, setStats] = useState(null);
  const { trackRef, handlers } = useMarquee();

  useEffect(() => {
    fetchDirectoryFacets()
      .then((data) => {
        const live = [...data.categories].sort((a, b) => b.count - a.count).map((c) => c.value);
        if (live.length >= 6) setCategories(live);
      })
      .catch(() => {});
    fetchPublicStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const numbers = [
    typeof stats?.verifiedBusinesses === "number" && [format(stats.verifiedBusinesses), "verified businesses"],
    [format(MALAYSIA_MSMES), "MSMEs in Malaysia"],
    typeof stats?.publishedEndorsements === "number" && [format(stats.publishedEndorsements), "endorsements given"],
  ].filter(Boolean);

  const ITEM =
    "inline-flex items-center gap-8 pr-8 text-[1rem] whitespace-nowrap after:size-1 after:rounded-full after:bg-yellow after:content-['']";

  // ABRI's numbers are spread through the row, one before every five
  // industries, so a visitor meets one wherever the loop happens to be.
  const sequence = [];
  categories.forEach((category, i) => {
    if (i % 5 === 0 && numbers.length) {
      const [value, label] = numbers[(i / 5) % numbers.length];
      sequence.push({ kind: "number", value, label, key: `n${i}` });
    }
    sequence.push({ kind: "category", category, key: category });
  });

  // Two copies back to back; the track slides left by exactly one copy and
  // loops. The second copy is hidden from screen readers and the tab order.
  const run = (copy) =>
    sequence.map((item) =>
      item.kind === "number" ? (
        <span
          key={`${copy}-${item.key}`}
          aria-hidden={copy === 1 || undefined}
          className={cn(ITEM, "text-grey-600 dark:text-muted-foreground")}
        >
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="size-4 text-yellow-hi" aria-hidden />
            <b className="font-display font-bold text-ink dark:text-foreground">{item.value}</b>
            {item.label}
          </span>
        </span>
      ) : (
        <Link
          key={`${copy}-${item.key}`}
          to={`/directory?category=${encodeURIComponent(item.category)}`}
          aria-hidden={copy === 1 || undefined}
          tabIndex={copy === 1 ? -1 : undefined}
          className={cn(
            ITEM,
            "font-medium text-grey-600 transition-colors hover:text-ink dark:text-muted-foreground dark:hover:text-foreground",
          )}
        >
          {item.category}
        </Link>
      ),
    );

  // The faded ends are two overlays in the page colour rather than a mask on
  // the row: a mask makes the browser redraw the moving text as an image,
  // which softens it.
  const fade = "pointer-events-none absolute inset-y-0 z-10 w-[12%] from-background to-transparent";

  return (
    <nav aria-label="ABRI in numbers and industries" className={cn("relative overflow-hidden py-1", className)} {...handlers}>
      <span className={cn(fade, "left-0 bg-gradient-to-r")} aria-hidden />
      <span className={cn(fade, "right-0 bg-gradient-to-l")} aria-hidden />
      <div ref={trackRef} className="flex w-max items-center">
        {run(0)}
        {run(1)}
      </div>
    </nav>
  );
}

export { IndustryTicker };
