import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { VerificationIcon } from "@/components/badge/VerificationIcon";
import { VerificationBadge } from "@/components/badge/VerificationBadge";

function Hero() {
  return (
    <header className="overflow-hidden pt-16 pb-16 md:pt-24 md:pb-28">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Copy */}
        <div>
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase">
            The verified business network · Malaysia
          </span>
          <h1 className="mt-3 text-[clamp(40px,5.2vw,62px)] leading-[1.06] font-extrabold tracking-[-0.028em] text-ink">
            Do business with companies you can{" "}
            <span className="relative whitespace-nowrap">
              <span className="absolute inset-x-[-2px] bottom-[5px] -z-10 h-4 rounded-[3px] bg-yellow-soft" />
              trust
            </span>
            .
          </h1>
          <p className="mt-[22px] max-w-[32rem] text-[19px] text-grey-600">
            Every company on ABRI is verified against official SSM records — so
            the first handshake starts with proof, not guesswork.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-[22px] py-[13px] text-[15px] leading-none font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
            >
              Claim your business
            </Link>
            <a
              href="#"
              className="inline-flex items-center gap-2 rounded-sm border border-grey-300 px-[22px] py-[13px] text-[15px] leading-none font-bold text-ink transition-colors hover:bg-surface-2"
            >
              Browse verified companies
            </a>
          </div>
          <div className="mt-[26px] flex items-center gap-2.5 text-[13px] text-grey-500">
            <VerificationIcon tier="verified" size="small" />
            Anchored to official Companies Commission of Malaysia data
          </div>
        </div>

        {/* Profile card preview */}
        <div className="relative">
          <div className="relative ml-auto max-w-[430px] rounded-lg border border-grey-200 bg-white p-7 shadow-md md:mx-auto lg:mx-0 lg:ml-auto">
            <span className="absolute -top-4 -right-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-[11px] py-1.5 font-mono text-[10.5px] tracking-[0.06em] text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-green-400" />
              Live
            </span>

            <div className="flex items-start gap-4">
              <div className="grid size-14 flex-none place-items-center rounded-xl bg-ink text-xl font-extrabold text-yellow">
                M
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[19px] font-extrabold text-ink">
                  Meridian Accounting
                  <VerificationIcon tier="verified" size="medium" />
                </div>
                <div className="mt-[3px] text-[13.5px] text-grey-600">
                  Accounting &amp; tax · Petaling Jaya · Member since 2026
                </div>
                <div className="mt-2">
                  <VerificationBadge tier="verified" size="inline" chip />
                </div>
              </div>
            </div>

            <div className="my-[18px] overflow-hidden rounded-md border border-grey-200">
              <div className="flex justify-between border-b border-grey-200 bg-surface px-3.5 py-2 font-mono text-[10.5px] tracking-[0.1em] text-grey-500 uppercase">
                <span>SSM record</span>
                <span>✓ Verified on 24 Jun 2026</span>
              </div>
              <div className="px-3.5 py-3 font-mono text-[12.5px] leading-[1.7] text-ink">
                Reg. 201801019345 ·{" "}
                <span className="rounded-[4px] bg-yellow-soft px-[5px] text-yellow-ink">
                  Active
                </span>{" "}
                · Authorised representative confirmed
              </div>
            </div>

            <div className="my-4 overflow-hidden rounded-md border border-grey-200">
              <div className="border-b border-grey-200 bg-surface px-3.5 py-2 font-mono text-[10.5px] tracking-[0.1em] text-grey-500 uppercase">
                Peer vouch
              </div>
              <div className="px-3.5 py-3">
                <p className="text-sm text-[#4a473f] italic">
                  “Sorted our SSM filing in a day — completely reliable.”
                </p>
                <div className="mt-[7px] font-mono text-[11px] text-grey-500">
                  — Sentul Corp Services, SSM-Verified
                </div>
              </div>
            </div>

            <div className="mt-[18px] flex gap-2.5">
              <Button
                variant="secondary"
                className="h-auto flex-1 justify-center rounded-sm py-2.5 text-[13.5px]"
              >
                Save contact
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-1 justify-center rounded-sm border-grey-300 py-2.5 text-[13.5px]"
              >
                Connect
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export { Hero };
