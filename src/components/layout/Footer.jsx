import { Link } from "react-router-dom";

import { VerificationIcon } from "@/components/ui/VerificationIcon";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "#how", label: "How it works" },
      { href: "#trust", label: "The badge" },
      { href: "#pricing", label: "Membership" },
      { href: "#", label: "Directory" },
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
    <footer className="border-t border-grey-200 py-14 pb-10">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mb-10 grid grid-cols-2 gap-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link
              to="/"
              className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink"
            >
              <span className="grid size-[30px] place-items-center rounded-[7px] bg-ink text-base font-extrabold text-yellow">
                A
              </span>
              ABRI
            </Link>
            <p className="mt-3 max-w-[26rem] text-[13.5px] text-grey-500">
              The verified business network — where every member is
              SSM-verified, vouched for by real peers, and trusted from day
              one.
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h4 className="mb-3.5 text-xs tracking-[0.1em] text-grey-500 uppercase">
                {column.heading}
              </h4>
              {column.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="block py-1 text-sm text-grey-600 hover:text-ink"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-grey-200 pt-6 text-[13px] text-grey-500">
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