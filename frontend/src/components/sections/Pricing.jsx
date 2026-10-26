import { Link } from "react-router-dom";

import { MembershipTierComparison } from "@/components/sections/MembershipTierComparison";

function Pricing() {
  return (
    <section id="pricing" className="pt-0 pb-[60px] md:pb-[104px]">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto mb-13 max-w-[640px] text-center">
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
            Your network. Your next level.
          </span>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
            Start with a connection. Grow when you’re ready.
          </h2>
          <p className="mt-3.5 text-[17px] text-grey-600 dark:text-muted-foreground">
            Join free. Find your circle. Choose more as you grow. Paid plans
            are billed yearly, in Malaysian Ringgit.
          </p>
        </div>

        <MembershipTierComparison />

        <div className="mx-auto mt-11 max-w-[640px] rounded-md bg-surface-2 px-7 py-5 text-center text-[14.5px] text-grey-600 dark:bg-muted dark:text-muted-foreground">
          <b className="text-ink dark:text-foreground">Founding members — join before launch.</b>{" "}
          Every business that joins before ABRI launches is a Founding member:
          every Pro feature free until the founding period ends, the founding
          badge for good, and a founding discount if you stay on a paid tier.{" "}
          <Link to="/register" className="border-b-2 border-yellow font-bold text-ink dark:text-foreground">
            Claim your business →
          </Link>
        </div>

        <div className="mx-auto mt-[22px] max-w-[640px] text-center text-sm text-grey-500 dark:text-muted-foreground">
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