import { Button } from "@/components/ui/button";
import { VerificationIcon } from "@/components/badge/VerificationIcon";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    tier: "verified",
    heading: "SSM-Verified",
    description:
      "The company legally exists and is active, and a real, authorised person stands behind it.",
    earn: "Earned: registry match + director confirmation",
    featured: true,
  },
  {
    tier: "trusted",
    heading: "Trusted Business",
    description:
      "Vouched for by verified peers — ten businesses have staked their own name on this one.",
    earn: "Earned: 10 verified vouches",
    featured: false,
  },
  {
    tier: null,
    heading: "Network Leader",
    description:
      "The highest status — reserved for members who give the most back to the network.",
    earn: "Earned: 25 received · 10 given",
    featured: false,
    soon: true,
  },
];

const CHECKLIST = [
  {
    bold: "Only verified members can vouch",
    rest: " — one vouch per business, tied publicly to the voucher's own profile.",
  },
  {
    bold: "Every vouch can carry a testimonial",
    rest: " — 140 characters, quotable, living on your profile permanently.",
  },
  {
    bold: "Generosity comes back",
    rest: " — thank your voucher, vouch back, and both profiles grow.",
  },
];

function TrustBand() {
  return (
    <section
      id="trust"
      className="border-y border-grey-200 bg-white py-[60px] dark:border-border dark:bg-background md:py-[104px]"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mb-13 max-w-[640px]">
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
            The verification difference
          </span>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
            A badge that actually means something.
          </h2>
          <p className="mt-3.5 text-[17px] text-grey-600 dark:text-muted-foreground">
            Not a sticker anyone can buy. Every state on ABRI is earned a
            specific way — and everyone can see how.
          </p>
        </div>

        <div className="mb-18 grid grid-cols-1 gap-5 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.heading}
              className={cn(
                "rounded-lg border border-grey-200 bg-white p-7 dark:border-border dark:bg-card",
                t.featured &&
                  "border-yellow bg-linear-to-b from-yellow-soft to-white to-55% dark:from-yellow-soft/20 dark:to-card",
              )}
            >
              <h3 className="mb-2.5 flex items-center gap-2 text-[16.5px] font-extrabold text-ink dark:text-foreground">
                {t.tier && <VerificationIcon tier={t.tier} size="small" />}
                {t.heading}
                {t.soon && (
                  <span className="ml-auto rounded-full border border-dashed border-grey-300 px-2 py-[3px] font-mono text-[10px] tracking-[0.08em] text-grey-500 uppercase dark:border-border dark:text-muted-foreground">
                    coming
                  </span>
                )}
              </h3>
              <p className="text-[14.5px] text-grey-600 dark:text-muted-foreground">{t.description}</p>
              <div className="mt-3.5 font-mono text-[11.5px] text-grey-500 dark:text-muted-foreground">
                {t.earn}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
              Vouching · how status is earned
            </span>
            <h2 className="mt-3 text-[clamp(24px,2.8vw,32px)] leading-[1.15] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
              Credibility from peers who stake their name on it.
            </h2>
            <ul className="mt-6 grid gap-4">
              {CHECKLIST.map((item) => (
                <li
                  key={item.bold}
                  className="grid grid-cols-[24px_1fr] gap-3 text-[15.5px] text-grey-600 dark:text-muted-foreground"
                >
                  <VerificationIcon tier="verified" size="small" />
                  <span>
                    <b className="text-ink dark:text-foreground">{item.bold}</b>
                    {item.rest}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-w-[420px] rounded-lg border border-grey-200 bg-white p-[26px] shadow-md dark:border-border dark:bg-card">
            <p className="text-[16.5px] text-[#3d3a34] italic dark:text-grey-300">
              “Our go-to for anything tax. Responsive, honest, and they know SME
              realities.”
            </p>
            <div className="mt-3.5 flex items-center gap-2.5">
              <VerificationIcon tier="verified" size="small" />
              <div>
                <div className="text-[13.5px] font-bold text-ink dark:text-foreground">
                  Nimbus IT Consulting
                </div>
                <div className="font-mono text-[11px] text-grey-500 dark:text-muted-foreground">
                  verified vouch · Jun 2026
                </div>
              </div>
            </div>
            <div className="mt-[18px] flex gap-2.5 border-t border-grey-100 pt-4 dark:border-border">
              <Button className="h-auto flex-1 justify-center rounded-sm py-2.5 text-[13px]">
                Thank them
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-1 justify-center rounded-sm border-grey-300 py-2.5 text-[13px] dark:border-border"
              >
                Vouch back
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export { TrustBand };
