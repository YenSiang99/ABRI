import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkle } from "lucide-react";

import { fetchDirectoryFacets } from "@/lib/api/businesses";
import { BUSINESS_CATEGORIES } from "@/lib/businessVocab";

// The tilted ribbon of industries from Homepage v4, laid across the bottom of
// the hero stage. The industries are the directory's own categories, busiest
// first, and each opens the directory filtered to it. Until the facets load
// (or if they fail) it shows the full category list, which is the same
// vocabulary the server accepts.
function IndustryMarquee() {
  const [categories, setCategories] = useState(BUSINESS_CATEGORIES);

  useEffect(() => {
    fetchDirectoryFacets()
      .then((data) => {
        const live = [...data.categories].sort((a, b) => b.count - a.count).map((c) => c.value);
        if (live.length >= 6) setCategories(live);
      })
      .catch(() => {});
  }, []);

  // Two copies back to back; the track slides left by exactly one copy and
  // loops. The second copy is hidden from screen readers and the tab order.
  const run = (copy) =>
    categories.map((category) => (
      <Link
        key={`${copy}-${category}`}
        to={`/directory?category=${encodeURIComponent(category)}`}
        aria-hidden={copy === 1 || undefined}
        tabIndex={copy === 1 ? -1 : undefined}
        className="inline-flex items-center gap-7 pr-7 font-display text-[17px] font-bold tracking-[-0.01em] whitespace-nowrap text-white transition-colors hover:text-yellow sm:text-[24px]"
      >
        {category}
        <Sparkle className="size-5 fill-yellow text-yellow" aria-hidden />
      </Link>
    ));

  return (
    <section
      aria-label="Industries on ABRI"
      className="relative z-20 -mx-5 -mt-12 -rotate-[1.2deg] overflow-hidden border-y-2 border-black bg-black sm:-mt-14 dark:border-border"
    >
      <div className="flex w-max items-center py-3.5 sm:py-[18px] motion-safe:animate-[abri-marquee_60s_linear_infinite] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
        {run(0)}
        {run(1)}
      </div>
    </section>
  );
}

export { IndustryMarquee };
