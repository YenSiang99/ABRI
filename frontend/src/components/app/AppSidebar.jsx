import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  UserCircle,
  Handshake,
  Compass,
  Search,
  LogOut,
  X,
  ShieldCheck,
  CreditCard,
  Lock,
  ClipboardCheck,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { verificationLevelLabel } from "@/lib/trustLabels";
import { membershipTierLabel, canUpgradeFromMembershipTier, membershipTierAllows } from "@/lib/membershipTiers";
import { CLAIMED } from "@/lib/verificationLevels";

const WORKSPACE_ITEMS = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "My Profile", url: "/app/profile", icon: UserCircle },
  { title: "Vouches", url: "/app/vouches", icon: Handshake, lockWhenPending: true },
  { title: "Network", url: "/app/network", icon: Compass },
  { title: "Directory", url: "/app/directory", icon: Search },
];

// The admin's two queues are siblings, and the sidebar is where that has to
// be visible. Vouch review used to be reachable only through a link on the
// claims page, which read as though flagged vouches were part of claim
// review — a different job on different records.
const ADMIN_ITEMS = [
  { title: "Claims review", url: "/app/admin", icon: ClipboardCheck },
  { title: "Vouch review", url: "/app/admin/vouch-reviews", icon: Flag },
];

// Two independent reasons an item can be shut, so two fields rather than
// one: lockWhenPending is verification (level L1), lockFeature is the plan.
// The NFC card is behind both, and the page itself decides which message
// to show when they overlap.
//
// Both fields are kept even though only one item uses each right now. They
// outlived Introductions, which was removed in Aug 2026 for being a screen
// backed entirely by mock data, and whatever Pro gets in its place will
// almost certainly want the same pair.
const TRUST_ITEMS = [
  // "Levels & tiers" while this was one page covering all three axes. Named
  // for the one axis it covers now: the vouch ladder moved onto /app/vouches
  // and the tier table became /app/plan, which the tier chip below links to.
  { title: "Verification", url: "/app/verify", icon: ShieldCheck },
  { title: "NFC Card", url: "/app/card", icon: CreditCard, lockWhenPending: true, lockFeature: "nfcCard" },
];

// Counts capped at 9+ so a member who's been away for a month doesn't get a
// three-digit pill wide enough to push the nav label out of the row.
function NavBadge({ count, label }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} ${label}`}
      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
  business,
  isAdmin,
  locked,
  unreadCount,
  vouchActionCount,
  onSignOut,
}) {
  // Prefix match, except for the two urls that are prefixes of their own
  // children — /app is under everything, and /app/admin is under
  // /app/admin/vouch-reviews. Those need an exact match or they'd light up
  // alongside the child that's actually open.
  const EXACT = new Set(["/app", "/app/admin"]);
  const isActive = (url) => (EXACT.has(url) ? pathname === url : pathname.startsWith(url));

  return (
    <>
      <Link to="/" className="flex items-center gap-2 px-4 py-4" onClick={onNavigate}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-bold text-background">
          A
        </div>
        <span className="text-base font-semibold tracking-tight text-foreground">ABRI</span>
      </Link>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {isAdmin ? (
          <>
            <div className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Admin
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {ADMIN_ITEMS.map((item) => (
                <Link
                  key={item.title}
                  to={item.url}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    isActive(item.url)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.title}</span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Workspace
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {WORKSPACE_ITEMS.map((item) => (
                <Link
                  key={item.title}
                  to={item.url}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    isActive(item.url)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.title}</span>
                  {item.lockWhenPending && locked && (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {/* The feed lives on the dashboard, so that's where the
                      unread count belongs — a badge on any other item would
                      point at a page that can't clear it. */}
                  {item.url === "/app" && <NavBadge count={unreadCount} label="unread" />}
                  {/* Counts only vouches whose turn is yours, matching the
                      Requests tab badge. Hidden while locked, where the page
                      itself is a LockedFeature and the count would point at
                      work the member can't reach.

                      NOT hidden for a Free member, though — a plan lock and
                      a verification lock call this differently, on purpose.
                      A Free member's vouch requests are real, addressed to
                      them, and readable in full; only publishing one is
                      priced. The badge points at something genuinely
                      waiting, and the nag is the pitch.

                      The rule, for whatever badge comes next: count it when
                      the member can at least OPEN what it refers to. Hide it
                      when the page behind it is a LockedFeature, where the
                      count would be advertising work that isn't there. */}
                  {item.url === "/app/vouches" && !locked && (
                    <NavBadge count={vouchActionCount} label="waiting on you" />
                  )}
                </Link>
              ))}
            </div>

            <div className="mt-5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Trust
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {TRUST_ITEMS.map((item) => {
                const planLocked =
                  item.lockFeature && !membershipTierAllows(business?.membershipTier, item.lockFeature);
                return (
                  <Link
                    key={item.title}
                    to={item.url}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive(item.url)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.title}</span>
                    {((item.lockWhenPending && locked) || planLocked) && (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {!isAdmin && (
          <>
            <div className="flex items-center gap-2 rounded-lg px-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
                {business.name.charAt(0)}
              </div>
              <div className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm font-medium text-sidebar-foreground">{business.name}</span>
                <Link
                  to="/app/verify"
                  className="truncate text-xs text-muted-foreground hover:text-sidebar-foreground"
                >
                  {verificationLevelLabel[business.verificationLevel] ?? business.verificationLevel}
                  {business.ssm ? ` · ${business.ssm}` : ""}
                </Link>
              </div>
            </div>
            {/* Billing metadata, NOT a third trust signal — see the
                membershipTier comment in schema.prisma. The one axis on this
                page that was BOUGHT rather than earned, and it has to LOOK
                bought.

                Three shapes, three meanings, and they must stay distinct:
                  verification level — circular mark, bold sans, yellow/ink
                  vouch level        — rounded-full pill, inline icon
                  membership tier    — squared rounded-sm mono chip, muted

                Squared rather than the circular mark VerificationBadge uses
                or the pill VouchBadge uses, so it can't be misread as a rank
                alongside the verification level shown directly above it.
                Both chips stay muted for the same reason: the yellow this
                first used is VerificationIcon's "verified" colour, which one
                line under "SSM-Verified" read as a second trust mark.

                The Aug 2026 rename made the shapes matter MORE, not less.
                Two of the three axes are now both called levels, so the
                typography is what tells a reader which one earned nothing
                and which one was paid for. */}
            {membershipTierLabel[business.membershipTier] && (
              <div className="mt-1 flex items-center gap-2 px-2 py-1.5">
                <Link
                  to="/app/plan"
                  className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase hover:text-sidebar-foreground"
                >
                  {membershipTierLabel[business.membershipTier]}
                </Link>
                {business.isFoundingMember && (
                  <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                    Founding
                  </span>
                )}
                {canUpgradeFromMembershipTier(business.membershipTier) && (
                  <Link
                    to="/app/plan"
                    className="ml-auto text-xs font-medium text-muted-foreground hover:text-sidebar-foreground"
                  >
                    Upgrade
                  </Link>
                )}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  );
}

function AppSidebar({ mobileOpen, onCloseMobile }) {
  const { pathname } = useLocation();
  const { business, isAdmin, logout } = useAuth();
  const { unreadCount, vouchActionCount } = useNotifications();

  if (!business && !isAdmin) return null;

  const locked = business?.verificationLevel === CLAIMED;

  // No explicit navigate() here — ProtectedRoute (wrapping every /app/*
  // route this sidebar renders inside) redirects to /login as soon as
  // isAuthenticated flips false, so this just needs to flip that flag.
  function handleSignOut() {
    logout();
  }

  return (
    <>
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar">
        <SidebarNav
          pathname={pathname}
          business={business}
          isAdmin={isAdmin}
          locked={locked}
          unreadCount={unreadCount}
          vouchActionCount={vouchActionCount}
          onSignOut={handleSignOut}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar shadow-lg">
            <button
              type="button"
              aria-label="Close menu"
              onClick={onCloseMobile}
              className="absolute top-4 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarNav
              pathname={pathname}
              onNavigate={onCloseMobile}
              business={business}
              isAdmin={isAdmin}
              locked={locked}
              unreadCount={unreadCount}
              vouchActionCount={vouchActionCount}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      )}
    </>
  );
}

export { AppSidebar };
