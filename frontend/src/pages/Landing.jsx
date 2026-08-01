import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { TrustBand } from "@/components/sections/TrustBand";
import { NfcSection } from "@/components/sections/NfcSection";
import { Pricing } from "@/components/sections/Pricing";
import { FinalCta } from "@/components/sections/FinalCta";

function Landing() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <TrustBand />
      <NfcSection />
      <Pricing />
      <FinalCta />
    </>
  );
}

export { Landing };