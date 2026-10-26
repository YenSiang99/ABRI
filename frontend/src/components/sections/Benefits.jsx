import { Link } from "react-router-dom";

import verifiedImage from "@/assets/home/card-verified.jpg";
import endorsementImage from "@/assets/home/card-endorsement.jpg";
import referralsImage from "@/assets/home/card-referrals.jpg";
import { Eyebrow } from "@/components/sections/Eyebrow";
import {
  CARD,
  CARD_BODY,
  CARD_TITLE,
  CONTAINER,
  H2,
  SECTION_HEAD,
  SECTION_Y,
} from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

const BENEFITS = [
  {
    image: verifiedImage,
    alt: "Verified business profile network",
    title: "ABRI Verified",
    body: "Look for the badge. It means the business completed ABRI’s verification process.",
    link: { to: "/faq", label: "The ABRI Verified difference" },
  },
  {
    image: endorsementImage,
    alt: "Endorsements and reviews from members",
    title: "Earn endorsements",
    body: "Real feedback from members who have worked with the business.",
    link: { to: "/register", label: "Build your credibility" },
  },
  {
    image: referralsImage,
    alt: "Members introducing businesses to each other",
    title: "Referrals & introductions",
    body: "Grow through introductions from people who know your work.",
    link: { to: "/directory", label: "Grow through your network" },
  },
];

function Benefits() {
  return (
    <section
      id="benefits"
      className={cn("border-y border-grey-200 bg-white dark:border-border dark:bg-card", SECTION_Y)}
    >
      <div className={CONTAINER}>
        <div className={SECTION_HEAD}>
          <Eyebrow>More than a business directory</Eyebrow>
          <h2 className={H2}>Know who you’re dealing with.</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <article
              key={b.title}
              className={cn(CARD, "flex min-w-0 flex-col transition-all hover:-translate-y-0.5 hover:shadow-md")}
            >
              {/* White behind the artwork in both themes: the illustrations are
                  drawn on white and would show a box edge on a dark card.
                  Dimmed in dark mode so the panels don't outshine the text. */}
              <div className="mb-[18px] aspect-[3/2] w-full overflow-hidden rounded-md bg-white dark:brightness-[0.82]">
                <img src={b.image} alt={b.alt} loading="lazy" className="size-full object-contain" />
              </div>
              <h3 className={cn(CARD_TITLE, "mb-2")}>{b.title}</h3>
              <p className={CARD_BODY}>{b.body}</p>
              <Link
                to={b.link.to}
                className="mt-auto self-start border-b-2 border-yellow pt-4 text-[14.5px] font-bold text-ink dark:text-foreground"
              >
                {b.link.label} →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export { Benefits };
