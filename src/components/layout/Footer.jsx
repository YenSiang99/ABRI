import { Link } from "react-router-dom";

import { VerificationIcon } from "@/components/badge/VerificationIcon";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#trust", label: "The badge" },
      { href: "/#pricing", label: "Membership" },
      { to: "/directory", label: "Directory" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "#", label: "About" },
      { href: "#", label: "Contact" },
      { href: "#", label: "FAQ" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "#", label: "Privacy" },
      { href: "#", label: "Terms" },
    ],
  },
];

function Footer() {
  return (
    <footer className="border-t border-grey-200 py-14 pb-10 dark:border-border">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mb-10 grid grid-cols-2 gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link
              to="/"
              className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink dark:text-foreground"
            >
              <span className="grid size-[30px] place-items-center rounded-[7px] bg-ink text-base font-extrabold text-yellow dark:bg-grey-700">
                A
              </span>
              ABRI
            </Link>
            <p className="mt-3 max-w-[26rem] text-[13.5px] text-grey-500 dark:text-muted-foreground">
              The verified business network — where every member is
              SSM-verified, vouched for by real peers, and trusted from day
              one.
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h4 className="mb-3.5 text-xs tracking-[0.1em] text-grey-500 uppercase dark:text-muted-foreground">
                {column.heading}
              </h4>
              {column.links.map((link) =>
                link.to ? (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="block py-1 text-sm text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block py-1 text-sm text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-grey-200 pt-6 text-[13px] text-grey-500 dark:border-border dark:text-muted-foreground">
          <span>© 2026 ABRI. All rights reserved.</span>
          <span className="flex items-center gap-2">
            <VerificationIcon tier="verified" size="small" />
            Verified against SSM records
          </span>
        </div>
      </div>
    </footer>
  );
}

export { Footer };