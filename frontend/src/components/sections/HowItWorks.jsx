import { Link } from "react-router-dom";

import { Eyebrow } from "@/components/sections/Eyebrow";
import {
  BTN_PRIMARY,
  CARD,
  CARD_BODY,
  CARD_TITLE,
  CONTAINER,
  H2,
  SECTION_HEAD,
  SECTION_PB,
} from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// The three line illustrations from the homepage draft, ported as-is. Their
// colours are fixed rather than themed: each sits on its own white panel.
const line = { fill: "none", stroke: "#6B7280", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };

function ProfileScene() {
  return (
    <svg viewBox="0 0 300 160" role="img" aria-label="Verified business profile" className="size-full">
      <path fill="none" stroke="#6B7280" strokeWidth="1" strokeDasharray="3 5" d="M32 115V51Q32 29 57 29H245M261 49V124H52" />
      <rect fill="#FEF3C7" x="78" y="25" width="154" height="111" rx="6" transform="rotate(8 78 25)" />
      <rect fill="#FFFFFF" stroke="#6B7280" strokeWidth="1.5" x="68" y="20" width="155" height="116" rx="6" />
      <path {...line} d="M68 43H223" />
      <circle fill="#FBBF24" cx="81" cy="32" r="3" />
      <circle fill="#FEF3C7" cx="91" cy="32" r="3" />
      <rect fill="#FEF3C7" x="83" y="58" width="37" height="37" rx="5" />
      <circle fill="#111827" cx="102" cy="71" r="7" />
      <path fill="#111827" d="M90 91a12 12 0 0 1 24 0" />
      <path {...line} d="M134 65H196M134 77H180M134 89H186M84 111H163M84 120H145" />
      <path fill="#111827" d="m218 86 25 10-3 29-22 15-22-15-3-29Z" />
      <path fill="none" stroke="#111827" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="m208 112 7 7 14-16" />
      <path {...line} d="M48 63v12M42 69h12M250 37v10M245 42h10" />
    </svg>
  );
}

function ConversationScene() {
  return (
    <svg viewBox="0 0 300 160" role="img" aria-label="Endorsements earned from real work" className="size-full">
      <path fill="none" stroke="#6B7280" strokeWidth="1" strokeDasharray="3 5" d="M71 50Q149 3 224 48M62 112Q150 160 237 106" />
      <rect fill="#FEF3C7" x="54" y="45" width="165" height="88" rx="9" />
      <rect fill="#FFFFFF" stroke="#6B7280" strokeWidth="1.5" x="64" y="33" width="166" height="87" rx="7" />
      <circle fill="#FEF3C7" cx="91" cy="59" r="12" />
      <circle fill="#111827" cx="91" cy="55" r="4" />
      <path fill="#111827" d="M83 67a8 8 0 0 1 16 0" />
      <path {...line} d="M113 54h89M113 63h59M84 84h125M84 95h95" />
      <path
        fill="#FBBF24"
        d="m79 107 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1ZM99 107l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1ZM119 107l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"
      />
      <rect fill="#111827" x="194" y="91" width="60" height="44" rx="6" />
      <path fill="#111827" d="m202 129-3 16 19-13" />
      <path fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" d="M211 110h26M211 118h17" />
      <path {...line} d="M43 82v10M38 87h10M246 48v10M241 53h10" />
    </svg>
  );
}

function GrowthScene() {
  return (
    <svg viewBox="0 0 300 160" role="img" aria-label="A reputation that opens doors" className="size-full">
      <path fill="none" stroke="#6B7280" strokeWidth="1" strokeDasharray="3 5" d="M42 125H263M69 126V36M93 24H246V125" />
      <rect fill="#FEF3C7" x="93" y="100" width="30" height="25" rx="3" />
      <rect fill="#FEF3C7" x="137" y="79" width="30" height="46" rx="3" />
      <rect fill="#111827" x="181" y="55" width="30" height="70" rx="3" />
      <path {...line} strokeWidth="2" d="m85 87 44-25 31 7 59-43M198 27l22-2-3 22" />
      <circle fill="#FBBF24" cx="232" cy="111" r="23" />
      <path {...line} strokeWidth="2.5" d="m222 111 7 7 13-15" />
      <circle fill="#FFFFFF" stroke="#6B7280" strokeWidth="1.5" cx="65" cy="104" r="19" />
      <circle fill="#111827" cx="65" cy="99" r="6" />
      <path fill="#111827" d="M54 115a11 11 0 0 1 22 0" />
      <path {...line} d="M47 47v12M41 53h12M249 60v10M244 65h10" />
    </svg>
  );
}

const STEPS = [
  {
    Scene: ProfileScene,
    title: "Show the business behind the name.",
    description: "Create your profile, complete verification and let the right people see what you do best.",
  },
  {
    Scene: ConversationScene,
    title: "Find your people. Start a conversation.",
    description: "Discover businesses, explore opportunities and connect with people who share your ambition.",
  },
  {
    Scene: GrowthScene,
    title: "Build trust. Grow together.",
    description: "Earn endorsements, strengthen your reputation and turn relationships into real opportunities.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className={SECTION_PB}>
      <div className={CONTAINER}>
        <div className={cn(SECTION_HEAD, "mx-auto text-center")}>
          <Eyebrow>Good connections start simply</Eyebrow>
          <h2 className={H2}>Your next chapter, in three steps.</h2>
        </div>

        <ol className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map(({ Scene, title, description }, i) => (
            <li key={title} className={cn(CARD, "transition-all hover:-translate-y-0.5 hover:shadow-md")}>
              {/* White behind the artwork in both themes: the illustrations
                  use fixed colours drawn for a white ground. Dimmed in dark mode so
                  the panels don't outshine the text. */}
              <div className="mb-[18px] h-[150px] rounded-md bg-white dark:brightness-[0.82]">
                <Scene />
              </div>
              <span className="mb-[18px] grid size-[26px] place-items-center rounded-full bg-yellow font-mono text-xs font-semibold text-yellow-ink">
                {i + 1}
              </span>
              <h3 className={cn(CARD_TITLE, "mb-2")}>{title}</h3>
              <p className={CARD_BODY}>{description}</p>
            </li>
          ))}
        </ol>

        <div className="mt-11 text-center">
          <Link to="/register" className={BTN_PRIMARY}>
            Make your first connection
          </Link>
        </div>
      </div>
    </section>
  );
}

export { HowItWorks };
