import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";

import { AbriLogo } from "@/components/layout/AbriLogo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuth } from "@/context/AuthContext";

// The links follow the Oct 2026 homepage draft. "Discover" goes to the
// directory itself rather than the homepage search box, so every public page
// keeps a one-click way into it.
const NAV_LINKS = [
  { to: "/directory", label: "Discover" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#opportunities", label: "Opportunities" },
  { href: "/#pricing", label: "Pricing" },
  { to: "/ask", label: "Ask ABRI" },
];

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleSignOut() {
    logout();
    setOpen(false);
    navigate("/");
  }

  return (
    <nav
      className={`sticky top-0 z-50 border-b border-grey-200 bg-white transition-shadow duration-200 dark:border-border dark:bg-background ${
        scrolled ? "shadow-sm" : ""
      }`}
      aria-label="Main"
    >
      <div className="mx-auto flex h-[82px] w-full max-w-[1296px] items-center justify-between gap-6 px-5 sm:px-6 lg:px-12">
        <Link to="/" aria-label="ABRI home" className="flex items-center">
          <AbriLogo className="h-[54px]" />
        </Link>

        <div className="hidden items-center gap-8 text-[15px] font-medium text-grey-600 dark:text-muted-foreground lg:flex">
          {NAV_LINKS.map((link) =>
            link.to ? (
              <Link
                key={link.label}
                to={link.to}
                className="transition-colors hover:text-ink dark:hover:text-foreground"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-ink dark:hover:text-foreground"
              >
                {link.label}
              </a>
            ),
          )}
        </div>

        <div className="flex items-center gap-3.5">
          <ThemeToggle className="hidden lg:inline-flex" />
          {isAuthenticated ? (
            <>
              <Link
                to="/app"
                className="hidden h-11 items-center rounded-[6px] px-4 text-[15px] leading-none font-semibold text-grey-600 transition-colors hover:bg-yellow-soft hover:text-ink dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground lg:inline-flex"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-transparent bg-yellow px-4 text-[15px] leading-none font-semibold text-ink transition-all duration-200 hover:-translate-y-px hover:bg-yellow-hi"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden h-11 items-center rounded-[6px] px-4 text-[15px] leading-none font-semibold text-grey-600 transition-colors hover:bg-yellow-soft hover:text-ink dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground lg:inline-flex"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-transparent bg-yellow px-4 text-[15px] leading-none font-semibold text-ink transition-all duration-200 hover:-translate-y-px hover:bg-yellow-hi"
              >
                Join ABRI
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </>
          )}
          <ThemeToggle className="lg:hidden" />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-[6px] text-grey-600 hover:bg-yellow-soft hover:text-ink dark:text-foreground dark:hover:bg-muted lg:hidden"
          >
            {open ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-grey-200 bg-white px-5 py-5 sm:px-6 dark:border-border dark:bg-background lg:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) =>
              link.to ? (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="rounded-[6px] px-2 py-2.5 text-[15px] font-medium text-grey-600 hover:bg-surface-2 hover:text-ink dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-[6px] px-2 py-2.5 text-[15px] font-medium text-grey-600 hover:bg-surface-2 hover:text-ink dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
                >
                  {link.label}
                </a>
              ),
            )}
            {isAuthenticated ? (
              <>
                <Link
                  to="/app"
                  onClick={() => setOpen(false)}
                  className="mt-2 inline-flex h-11 items-center justify-center rounded-[6px] border border-grey-200 bg-white px-4 text-[15px] leading-none font-semibold text-ink hover:border-ink dark:border-border dark:bg-card dark:text-foreground dark:hover:border-foreground"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-2 inline-flex h-11 items-center justify-center rounded-[6px] border border-transparent bg-yellow px-4 text-[15px] leading-none font-semibold text-ink hover:bg-yellow-hi"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-[6px] border border-grey-200 bg-white px-4 text-[15px] leading-none font-semibold text-ink hover:border-ink dark:border-border dark:bg-card dark:text-foreground dark:hover:border-foreground"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export { NavBar };
