import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import verifiedImage from "@/assets/home/card-verified.jpg";
import endorsementImage from "@/assets/home/card-endorsement.jpg";
import referralsImage from "@/assets/home/card-referrals.jpg";
import { Eyebrow } from "@/components/sections/Eyebrow";
import { CONTAINER, H2, SWIPE_ITEM, SWIPE_ROW, TEXT_LINK } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// "How ABRI works" as four tiles, from Homepage v6. Replaces the earlier
// three benefit cards and the three-step band, which said the same things
// twice. Tiles alternate between the cream and the gold tint.

// The NFC card tapping a phone, drawn for the draft. Fixed colours: it sits
// on its own white panel.
function NfcScene() {
  return (
    <svg viewBox="0 0 240 180" role="img" aria-label="An ABRI NFC card tapping a phone" className="h-auto w-[78%]">
      <rect x="128" y="18" width="78" height="146" rx="16" fill="#141413" />
      <rect x="134" y="24" width="66" height="134" rx="11" fill="#FFFFFF" />
      <rect x="152" y="40" width="30" height="30" rx="9" fill="#141413" />
      <text x="167" y="61" textAnchor="middle" fontFamily="Manrope, sans-serif" fontSize="17" fontWeight="800" fill="#FBBF24">
        A
      </text>
      <rect x="146" y="80" width="42" height="7" rx="3.5" fill="#141413" />
      <rect x="150" y="93" width="34" height="11" rx="5.5" fill="#FBBF24" />
      <rect x="142" y="112" width="50" height="14" rx="5" fill="#F6F4EF" />
      <rect x="142" y="132" width="50" height="14" rx="5" fill="#F6F4EF" />
      <path d="M112 74a22 22 0 0 1 0 32M120 66a34 34 0 0 1 0 48" fill="none" stroke="#FBBF24" strokeWidth="4" strokeLinecap="round" />
      <g transform="rotate(-14 62 90)">
        <rect x="14" y="58" width="96" height="62" rx="9" fill="#141413" />
        <rect x="24" y="68" width="24" height="8" rx="4" fill="#FBBF24" />
        <rect x="24" y="104" width="40" height="5" rx="2.5" fill="#5E5D59" />
      </g>
    </svg>
  );
}

const TILES = [
  {
    image: verifiedImage,
    alt: "A verified business profile",
    title: "Get verified",
    body: "Look for the badge. It means the business completed ABRI’s verification process.",
    link: { to: "/faq", label: "The ABRI Verified difference" },
  },
  {
    image: endorsementImage,
    alt: "Members endorsing a business",
    title: "Earn endorsements",
    body: "Real feedback from members who have worked with the business.",
    link: { to: "/register", label: "Build your credibility" },
  },
  {
    image: referralsImage,
    alt: "Members introducing businesses to each other",
    title: "Get introduced",
    body: "Grow through introductions from people who know your work.",
    link: { to: "/directory", label: "Grow through your network" },
  },
  {
    Scene: NfcScene,
    title: "Tap your NFC card",
    body: "One tap opens your verified profile on any phone.",
    link: { href: "/#pricing", label: "See what’s included" },
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className={cn(CONTAINER, "pt-16 md:pt-[120px]")}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Eyebrow>Good connections start simply</Eyebrow>
          <h2 className={H2}>How ABRI works</h2>
        </div>
        <Link to="/faq" className={TEXT_LINK}>
          Read the FAQ
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className={cn("mt-8 grid gap-5 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4", SWIPE_ROW)}>
        {TILES.map(({ image, alt, Scene, title, body, link }, i) => (
          <article
            key={title}
            className={cn(
              "flex flex-col rounded-[28px] px-4 pt-4 pb-[26px]",
              SWIPE_ITEM,
              i % 2 === 0 ? "bg-yellow-soft dark:bg-yellow/10" : "bg-surface-2 dark:bg-muted",
            )}
          >
            {/* White behind the artwork in both themes: it is drawn on white.
                Dimmed in dark mode so the panels don't outshine the text. */}
            <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-[20px] bg-white dark:brightness-[0.82]">
              {Scene ? <Scene /> : <img src={image} alt={alt} loading="lazy" className="size-full object-contain" />}
            </div>
            <h3 className="mx-2 mt-5 font-display text-[21px] leading-[1.25] font-bold tracking-[-0.02em] text-ink dark:text-foreground">
              {title}
            </h3>
            <p className="mx-2 mt-1.5 flex-1 text-[15px] leading-[1.6] text-grey-600 dark:text-muted-foreground">{body}</p>
            {link.to ? (
              <Link to={link.to} className={cn(TEXT_LINK, "mx-2 mt-[18px] self-start")}>
                {link.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <a href={link.href} className={cn(TEXT_LINK, "mx-2 mt-[18px] self-start")}>
                {link.label}
                <ArrowRight className="size-4" aria-hidden />
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export { HowItWorks };
