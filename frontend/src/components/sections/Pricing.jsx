import { Link } from "react-router-dom";

import { Sparkles } from "lucide-react";

import { Eyebrow } from "@/components/sections/Eyebrow";
import { MembershipTierComparison } from "@/components/sections/MembershipTierComparison";
import { CONTAINER, H2, LEAD } from "@/components/sections/marketing";

function Pricing() {
  return (
    <section
      id="pricing"
      className="border-t border-grey-200 bg-white pt-12 pb-12 md:pt-14 md:pb-[60px] dark:border-border dark:bg-card"
    >
      <div className={CONTAINER}>
        <div className="mb-9 text-center">
          <Eyebrow center>Your network. Your next level.</Eyebrow>
          <h2 className={H2}>
            Start with a connection.
            <br />
            Grow when you’re ready.
          </h2>
          <p className={LEAD}>
            Join free. Find your circle. Choose more as you grow. Paid plans
            are billed yearly, in Malaysian Ringgit.
          </p>
        </div>

        <MembershipTierComparison />

        <div className="mx-auto mt-10 flex max-w-[750px] gap-3.5 rounded-[6px] bg-[#1F2937] px-[18px] py-[19px] text-[15px] leading-[1.7] text-[#D1D5DB] sm:px-6 dark:border dark:border-border dark:bg-muted">
          <Sparkles className="mt-1 size-5 flex-none text-yellow" aria-hidden />
          <div>
          <b className="block text-[16px] font-semibold text-white">Founding members — join before launch.</b>
          Every business that joins before ABRI launches is a Founding member:
          every Pro feature free until the founding period ends, the founding
          badge for good, and a founding discount if you stay on a paid tier.{" "}
          <Link to="/register" className="font-semibold text-yellow hover:underline">
            Claim your business →
          </Link>
          </div>
        </div>

        <div className="mx-auto mt-5 max-w-[750px] text-center text-[13px] text-grey-600 dark:text-muted-foreground">
          You can choose a paid tier before your SSM check is done — your year
          starts the day you're verified, not the day you pay. But{" "}
          <b className="text-ink dark:text-foreground">
            you cannot pay your way to a verified badge
          </b>
          : paying unlocks what verified trust lets you do, never the trust
          itself.
        </div>
      </div>
    </section>
  );
}

export { Pricing };