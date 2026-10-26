import { Hero } from "@/components/sections/Hero";
import { TrustStrip } from "@/components/sections/TrustStrip";
import { Discover } from "@/components/sections/Discover";
import { Benefits } from "@/components/sections/Benefits";
import { OpportunityHub } from "@/components/sections/OpportunityHub";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { WhyAbri } from "@/components/sections/WhyAbri";
import { Pricing } from "@/components/sections/Pricing";
import { FinalCta } from "@/components/sections/FinalCta";

function Landing() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Discover />
      <Benefits />
      <OpportunityHub />
      <HowItWorks />
      <WhyAbri />
      <Pricing />
      <FinalCta />
    </>
  );
}

export { Landing };
