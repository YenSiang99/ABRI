import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#trust", label: "The badge" },
  { href: "/#pricing", label: "Membership" },
  { to: "/directory", label: "Directory" },
];

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 border-b bg-white/92 backdrop-blur transition-colors duration-200 ${
        scrolled ? "border-grey-200" : "border-transparent"
      }`}
      aria-label="Main"
    >
      <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink"
        >
          <span className="grid size-[30px] place-items-center rounded-[7px] bg-ink text-base font-extrabold text-yellow">
            A
          </span>
          ABRI
        </Link>

        <div className="hidden items-center gap-7 text-sm font-semibold text-grey-600 lg:flex">
          {NAV_LINKS.map((link) =>
            link.to ? (
              <Link
                key={link.label}
                to={link.to}
                className="transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ),
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/login"
            className="hidden rounded-sm border border-grey-300 px-4 py-2.5 text-sm leading-none font-bold text-ink transition-colors hover:bg-surface-2 lg:inline-flex"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-4 py-2.5 text-sm leading-none font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
          >
            Claim your business
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-sm border border-grey-300 p-2 lg:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-grey-200 bg-white px-6 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) =>
              link.to ? (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="rounded-sm px-2 py-2.5 text-sm font-semibold text-grey-600 hover:bg-surface-2 hover:text-ink"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-sm px-2 py-2.5 text-sm font-semibold text-grey-600 hover:bg-surface-2 hover:text-ink"
                >
                  {link.label}
                </a>
              ),
            )}
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-sm border border-grey-300 px-4 py-2.5 text-center text-sm leading-none font-bold text-ink hover:bg-surface-2"
            >
              Log in
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

export { NavBar };
