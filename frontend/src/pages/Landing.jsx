import { Hero } from "@/components/sections/Hero";
import { IndustryMarquee } from "@/components/sections/IndustryMarquee";
import { TrustStrip } from "@/components/sections/TrustStrip";
import { Discover } from "@/components/sections/Discover";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { OpportunityHub } from "@/components/sections/OpportunityHub";
import { Pricing } from "@/components/sections/Pricing";
import { FinalCta } from "@/components/sections/FinalCta";

// Order after Homepage v6 (blinq.me-style hero with the stage running past the
// first screen), with v5's floating cards on the stage and v4's industry
// ribbon across its foot. The tilted ribbon is wider than the page, so the
// clip keeps it from adding a sideways scroll.
function Landing() {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <IndustryMarquee />
      <div className="mt-14 border-t border-grey-200 dark:border-border">
        <TrustStrip />
      </div>
      <Discover />
      <HowItWorks />
      <OpportunityHub />
      <Pricing />
      <FinalCta />
    </div>
  );
}

export { Landing };
