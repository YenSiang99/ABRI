import { Handshake, Search, ShieldCheck } from "lucide-react";

import communityImage from "@/assets/home/community.jpg";
import { Eyebrow } from "@/components/sections/Eyebrow";
import { CARD_BODY, CONTAINER, H2, LEAD, SECTION_PB } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

const POINTS = [
  {
    icon: Handshake,
    title: "Turn introductions into opportunities",
    body: "Build relationships that lead to referrals and partnerships.",
  },
  {
    icon: Search,
    title: "Get found by the right people",
    body: "Be visible when someone is looking for what you offer.",
  },
  {
    icon: ShieldCheck,
    title: "Let your reputation speak first",
    body: "Build confidence before the very first hello.",
  },
];

function WhyAbri() {
  return (
    <section id="about" className={cn(CONTAINER, SECTION_PB, "grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16")}>
      <img
        src={communityImage}
        alt="A conversation between Malaysian business professionals"
        loading="lazy"
        className="h-auto w-full rounded-lg"
      />
      <div>
        <Eyebrow>Built here. For businesses like yours.</Eyebrow>
        <h2 className={H2}>
          Less collecting contacts.
          <br />
          More moving business forward.
        </h2>
        <p className={LEAD}>
          Great business relationships don’t happen by chance. They start with a shared need, a little trust and
          the right introduction.
        </p>
        <div className="mt-6 grid gap-4">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-5 flex-none text-yellow" aria-hidden />
              <div>
                <h3 className="text-[16.5px] font-extrabold text-ink dark:text-foreground">{title}</h3>
                <p className={cn(CARD_BODY, "mt-0.5")}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export { WhyAbri };
