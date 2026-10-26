import { Link } from "react-router-dom";

import { VerificationIcon } from "@/components/badge/VerificationIcon";
import { AbriLogo } from "@/components/layout/AbriLogo";

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
];

const LINK = "text-sm text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground";

function Footer() {
  return (
    <footer className="border-t border-grey-200 py-14 pb-10 dark:border-border">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mb-10 flex flex-col items-start gap-x-12 gap-y-6 sm:flex-row sm:flex-wrap sm:items-center">
          <Link to="/" aria-label="ABRI home" className="flex items-center">
            <AbriLogo className="h-[52px]" />
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

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-grey-200 pt-6 text-[13px] text-grey-500 dark:border-border dark:text-muted-foreground">
          <div className="space-y-1">
            <div>© 2026 ABRI. All rights reserved.</div>
            <div>Prelaunch preview. Photography is illustrative, not actual ABRI members.</div>
            {/* Required by the data licences: OpenStreetMap's ODbL and Overture
                Maps' terms both ask for a visible credit wherever their data
                is shown. */}
            <div>
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
            <Link to="/privacy" className="hover:text-ink dark:hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-ink dark:hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export { Footer };
