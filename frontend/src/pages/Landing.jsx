import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { OpportunityHub } from "@/components/sections/OpportunityHub";
import { Pricing } from "@/components/sections/Pricing";
import { FinalCta } from "@/components/sections/FinalCta";

// Order after Homepage v6, with a hero sized as blinq.me's (video running past
// the first screen on a desktop), v5's floating cards on the video and a
// moving row of ABRI's numbers and industries under the hero search.
function Landing() {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <HowItWorks />
      <OpportunityHub />
      <Pricing />
      <FinalCta />
    </div>
  );
}

export { Landing };
