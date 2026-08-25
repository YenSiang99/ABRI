import { PlanComparison } from "@/components/sections/PlanComparison";

function Pricing() {
  return (
    <section id="pricing" className="pt-0 pb-[60px] md:pb-[104px]">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto mb-13 max-w-[640px] text-center">
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
            Membership
          </span>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
            Simple, transparent membership.
          </h2>
          <p className="mt-3.5 text-[17px] text-grey-600 dark:text-muted-foreground">
            Start free and stay free for as long as you like. The paid tiers
            are annual — ABRI is a network you join, not software you
            subscribe to.
          </p>
        </div>

        <PlanComparison />

        <div className="mx-auto mt-11 max-w-[640px] rounded-md bg-surface-2 px-7 py-5 text-center text-[14.5px] text-grey-600 dark:bg-muted dark:text-muted-foreground">
          <b className="text-ink dark:text-foreground">Founding 100 — by invitation only.</b> The
          first hundred members of ABRI are hand-picked businesses invited to
          anchor the network. Founding members carry the founding badge
          permanently. If you believe your business belongs in the first
          hundred,{" "}
          <a href="#" className="border-b-2 border-yellow font-bold text-ink dark:text-foreground">
            request an invitation →
          </a>
        </div>

        <div className="mx-auto mt-[22px] max-w-[640px] text-center text-sm text-grey-500 dark:text-muted-foreground">
          Every paid tier still requires SSM verification —{" "}
          <b className="text-ink dark:text-foreground">
            you cannot pay your way to a verified badge
          </b>
          . Paying unlocks what verified trust lets you do, never the trust
          itself.
        </div>
      </div>
    </section>
  );
}

export { Pricing };