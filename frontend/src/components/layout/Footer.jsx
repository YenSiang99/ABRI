import { Link } from "react-router-dom";

import { VerificationIcon } from "@/components/badge/VerificationIcon";
import logoWhite from "@/assets/home/logo-white.png";
import worldMap from "@/assets/home/world-map.png";

// Laid out after the Oct 2026 homepage draft (one row of links beside the
// wordmark, then a bottom bar with the legal links); styled as the site was
// before it. Keeps the site's own pages alongside the draft's homepage anchors.
const FOOTER_LINKS = [
  { to: "/directory", label: "Discover" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { to: "/about", label: "About ABRI" },
  { to: "/contact", label: "Contact" },
  { to: "/faq", label: "FAQ" },
  { to: "/ask", label: "Ask ABRI" },
];

// The black footer from the homepage v2 draft, in both themes.
const LINK =
  "text-[15px] font-semibold text-white decoration-yellow decoration-2 underline-offset-4 transition-colors hover:text-yellow hover:underline";

function Footer() {
  return (
    <footer className="relative isolate overflow-hidden bg-black text-[#D1D5DB] dark:border-t dark:border-border">
      <img
        src={worldMap}
        alt=""
        aria-hidden
        className="pointer-events-none absolute top-1/2 -right-[120px] -z-10 w-[420px] max-w-none -translate-y-1/2 opacity-10 invert md:-right-10 md:w-[560px] md:opacity-[0.14]"
      />
      <div className="mx-auto w-full max-w-[1296px] px-5 sm:px-6 lg:px-12">
        <div className="flex flex-col items-start gap-x-12 gap-y-6 pt-12 pb-9 sm:flex-row sm:flex-wrap sm:items-center">
          <Link to="/" aria-label="ABRI home" className="flex items-center">
            <img src={logoWhite} alt="ABRI" className="h-[60px] w-auto" />
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-3">
            {FOOTER_LINKS.map((link) =>
              link.to ? (
                <Link key={link.label} to={link.to} className={LINK}>
                  {link.label}
                </Link>
              ) : (
                <a key={link.label} href={link.href} className={LINK}>
                  {link.label}
                </a>
              ),
            )}
          </nav>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-white/14 py-5 text-[13px] text-[#D1D5DB]">
          <div className="space-y-1">
            <div>© 2026 ABRI. All rights reserved.</div>
            <div className="text-[12px] text-[#9CA3AF]">Prelaunch preview. Photography is illustrative, not actual ABRI members.</div>
            {/* Required by the data licences: OpenStreetMap's ODbL and Overture
                Maps' terms both ask for a visible credit wherever their data
                is shown. */}
            <div className="text-[12px] text-[#9CA3AF]">
              Listing data includes{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                © OpenStreetMap contributors
              </a>{" "}
              and{" "}
              <a href="https://overturemaps.org" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Overture Maps Foundation
              </a>
              .
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <span className="flex items-center gap-2">
              <VerificationIcon mark="verified" size="small" />
              Verified against SSM records
            </span>
            <Link to="/privacy" className="font-semibold text-white hover:text-yellow">
              Privacy
            </Link>
            <Link to="/terms" className="font-semibold text-white hover:text-yellow">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export { Footer };
