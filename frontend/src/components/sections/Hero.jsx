import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { VerificationIcon } from "@/components/badge/VerificationIcon";
import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { SSM_VERIFIED } from "@/lib/verificationLevels";

function Hero() {
  return (
    <header className="overflow-hidden pt-16 pb-16 md:pt-24 md:pb-28">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Copy */}
        <div>
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
            The verified business network · Malaysia
          </span>
          <h1 className="mt-3 text-[clamp(40px,5.2vw,62px)] leading-[1.06] font-extrabold tracking-[-0.028em] text-ink dark:text-foreground">
            Do business with companies you can{" "}
            <span className="relative whitespace-nowrap">
              {/* A brand-yellow underline below the word, not a band behind
                  it: the old pale band sat under the bottom half of the
                  letters, which washed the word out in dark mode and all but
                  vanished in light mode. Yellow is the "verified" colour, so
                  it ties the headline to the badge. */}
              <span className="absolute inset-x-0 -bottom-[3px] h-[6px] rounded-full bg-yellow" aria-hidden />
              trust
            </span>
            .
          </h1>
          <p className="mt-[22px] max-w-[32rem] text-[19px] text-grey-600 dark:text-muted-foreground">
            Every SSM-Verified company on ABRI has been checked against the
            official SSM register — so the first handshake starts with proof,
            not guesswork.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-[22px] py-[13px] text-[15px] leading-none font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
            >
              Claim your business
            </Link>
            <Link
              to="/directory"
              className="inline-flex items-center gap-2 rounded-sm border border-grey-300 px-[22px] py-[13px] text-[15px] leading-none font-bold text-ink transition-colors hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted"
            >
              Browse the directory
            </Link>
          </div>
          <div className="mt-[26px] flex items-center gap-2.5 text-[13px] text-grey-500 dark:text-muted-foreground">
            <VerificationIcon mark="verified" size="small" />
            Anchored to official Companies Commission of Malaysia data
          </div>
        </div>

        {/* Profile card preview */}
        <div className="relative">
          <div className="relative ml-auto max-w-[430px] rounded-lg border border-grey-200 bg-white p-7 shadow-md dark:border-border dark:bg-card md:mx-auto lg:mx-0 lg:ml-auto">
            <span className="absolute -top-4 -right-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-[11px] py-1.5 text-[11px] font-semibold tracking-[0.04em] text-white dark:bg-grey-700">
              <span className="size-1.5 animate-pulse rounded-full bg-green-400" />
              Live
            </span>

            <div className="flex items-start gap-4">
              <div className="grid size-14 flex-none place-items-center rounded-xl bg-ink text-xl font-extrabold text-yellow dark:bg-grey-700">
                M
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[19px] font-extrabold text-ink dark:text-foreground">
                  Meridian Accounting
                  <VerificationIcon mark="verified" size="medium" />
                </div>
                <div className="mt-[3px] text-[13.5px] text-grey-600 dark:text-muted-foreground">
                  Accounting &amp; tax · Petaling Jaya · Member since 2026
                </div>
                <div className="mt-2">
                  {/* A real LEVEL, not the marketing mark. This passed
                      "verified" — a VerificationIcon value — through the level
                      badge, which worked only while one map answered to both
                      vocabularies. It renders "SSM-Verified" either way, which
                      is what the mock card is illustrating. */}
                  <VerificationBadge verificationLevel={SSM_VERIFIED} size="inline" chip />
                </div>
              </div>
            </div>

            <div className="my-[18px] overflow-hidden rounded-md border border-grey-200 dark:border-border">
              {/* Monospace only for the registry data itself — the number and
                  the date — so it reads as copied from a record, while the
                  labels and sentences stay in the site's type. */}
              <div className="flex justify-between border-b border-grey-200 bg-surface px-3.5 py-2 text-[11px] font-semibold tracking-[0.08em] text-grey-500 uppercase dark:border-border dark:bg-muted dark:text-muted-foreground">
                <span>SSM record</span>
                <span>
                  ✓ Verified on <span className="font-mono font-normal tracking-normal normal-case">24 Jun 2026</span>
                </span>
              </div>
              <div className="px-3.5 py-3 text-[13.5px] leading-[1.7] text-ink dark:text-foreground">
                Reg. <span className="font-mono">201801019345</span> ·{" "}
                <span className="rounded-[4px] bg-yellow-soft px-[5px] text-yellow-ink">
                  Active
                </span>{" "}
                · Authorised representative confirmed
              </div>
            </div>

            <div className="my-4 overflow-hidden rounded-md border border-grey-200 dark:border-border">
              <div className="border-b border-grey-200 bg-surface px-3.5 py-2 text-[11px] font-semibold tracking-[0.08em] text-grey-500 uppercase dark:border-border dark:bg-muted dark:text-muted-foreground">
                Peer vouch
              </div>
              <div className="px-3.5 py-3">
                <p className="text-sm text-[#4a473f] italic dark:text-grey-300">
                  “Sorted our SSM filing in a day — completely reliable.”
                </p>
                <div className="mt-[7px] text-[12px] text-grey-500 dark:text-muted-foreground">
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
                className="h-auto flex-1 justify-center rounded-sm border-grey-300 py-2.5 text-[13.5px] dark:border-border"
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
