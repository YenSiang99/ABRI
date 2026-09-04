import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  Inbox,
  Users,
  Eye,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useConnections } from "@/context/ConnectionsContext";
import { useNotifications } from "@/context/NotificationsContext";
import { verificationLevelLabel } from "@/lib/trustLabels";
import { membershipTierLabel, canUpgradeFromMembershipTier, membershipTierAllows } from "@/lib/membershipTiers";
import { CLAIMED } from "@/lib/verificationLevels";

// Network is the one item with children, and it has them because it holds
// three different relationships that a single page kept blurring: requests
// are work, connections are mutual and agreed, following is one-way and
// unannounced. As tabs on one screen they read as three views of the same
// list. As routes they read as what they are.
//
// It is also where the next thing goes. Groups, when it arrives, is a fourth
// child here rather than a fifth top-level item — which is the point of
// paying for the nesting now, while there are only three.
const WORKSPACE_ITEMS = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "My Profile", url: "/app/profile", icon: UserCircle },
  { title: "Vouches", url: "/app/vouches", icon: Handshake, lockWhenPending: true },
  {
    title: "Network",
    url: "/app/network",
    icon: Compass,
    children: [
      // Requests first: it's the only one of the three with work in it.
      { title: "Requests", url: "/app/network/requests", icon: Inbox },
      { title: "Connections", url: "/app/network/connections", icon: Users },
      { title: "Following", url: "/app/network/following", icon: Eye },
    ],
  },
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

// One row, used at both depths and by the admin list, so a top-level item and
// a child can't drift apart on padding or hover colour. `depth` is the only
// difference: an indent and a slightly smaller label.
function NavRow({ item, active, onNavigate, locked = false, depth = 0, children }) {
  return (
    <Link
      to={item.url}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
        depth === 0 ? "px-2.5" : "py-1.5 pr-2.5 pl-8 text-[13px]",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className={depth === 0 ? "h-4 w-4" : "h-3.5 w-3.5"} />
      <span className="flex-1">{item.title}</span>
      {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
      {children}
    </Link>
  );
}

// A parent that navigates nowhere. The header is a button, not a Link,
// because /app/network is only a redirect to its first child — making it a
// link would put two rows in the sidebar that land on the same page, and the
// member would have no way to tell which one they were on.
//
// Opens on its own whenever a child is active, so arriving from a badge, a
// deep link or the Connections page's "Review" button never leaves the
// member looking at a collapsed section that doesn't contain the page they
// can see. The manual toggle only matters when you're somewhere else.
function NavSection({ item, pathname, isActive, onNavigate, incomingCount }) {
  const sectionActive = pathname.startsWith(item.url);
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const open = sectionActive || manuallyOpen;

  return (
    <div>
      <button
        type="button"
        onClick={() => setManuallyOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
          sectionActive
            ? "text-sidebar-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1">{item.title}</span>
        {/* The count follows the work down to the child that owns it. While
            the section is collapsed it has to surface on the parent instead,
            or a member with requests waiting sees nothing at all. */}
        {!open && <NavBadge count={incomingCount} label="requests waiting on you" />}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")}
        />
      </button>

      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {item.children.map((child) => (
            <NavRow
              key={child.title}
              item={child}
              active={isActive(child.url)}
              onNavigate={onNavigate}
              depth={1}
            >
              {/* Only inbound requests. The ones you sent are on the same
                  page, but a badge for those would nag about work that
                  belongs to somebody else. Same rule as the Vouches badge. */}
              {child.url === "/app/network/requests" && (
                <NavBadge count={incomingCount} label="waiting on you" />
              )}
            </NavRow>
          ))}
        </div>
      )}
    </div>
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
  incomingCount,
  onSignOut,
}) {
  // Prefix match, except for the urls that are prefixes of their own
  // children — /app is under everything, /app/admin is under
  // /app/admin/vouch-reviews, and /app/network is under all three of its own
  // children. Those need an exact match or they'd light up alongside the
  // child that's actually open. (/app/network never renders as a row at all,
  // but it goes in the set anyway so the next reader doesn't have to work out
  // why one section parent is missing.)
  const EXACT = new Set(["/app", "/app/admin", "/app/network"]);
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
                <NavRow
                  key={item.title}
                  item={item}
                  active={isActive(item.url)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Workspace
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {WORKSPACE_ITEMS.map((item) =>
                item.children ? (
                  <NavSection
                    key={item.title}
                    item={item}
                    pathname={pathname}
                    isActive={isActive}
                    onNavigate={onNavigate}
                    incomingCount={incomingCount}
                  />
                ) : (
                  <NavRow
                    key={item.title}
                    item={item}
                    active={isActive(item.url)}
                    onNavigate={onNavigate}
                    locked={item.lockWhenPending && locked}
                  >
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
                  </NavRow>
                ),
              )}
            </div>

            <div className="mt-5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Trust
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {TRUST_ITEMS.map((item) => {
                const planLocked =
                  item.lockFeature && !membershipTierAllows(business?.membershipTier, item.lockFeature);
                return (
                  <NavRow
                    key={item.title}
                    item={item}
                    active={isActive(item.url)}
                    onNavigate={onNavigate}
                    locked={(item.lockWhenPending && locked) || planLocked}
                  />
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
  const navigate = useNavigate();
  const { business, isAdmin, logout } = useAuth();
  const { unreadCount, vouchActionCount } = useNotifications();
  // Requests waiting on THIS member, for the Network badge. Read here rather
  // than inside NavSection so the sidebar has one place that talks to
  // contexts, matching how the other two counts arrive.
  const { incoming } = useConnections();

  if (!business && !isAdmin) return null;

  const locked = business?.verificationLevel === CLAIMED;

  // Navigates BEFORE flipping the auth flag, and the order is the whole
  // point. Letting ProtectedRoute do the redirect (which is what this used
  // to do) means it also records state.from = wherever you were standing —
  // and that `from` outlives the session, so the NEXT person to log in on
  // this browser gets dropped onto the last person's page. Leaving from
  // /login ourselves means ProtectedRoute is already unmounted when
  // isAuthenticated flips, so nothing is recorded.
  //
  // A `from` still gets written for the involuntary cases (a deep link
  // opened while logged out, an expired cookie on reload), which is the
  // case it exists to serve: those really should resume where you were
  // headed. Signing out is not that.
  function handleSignOut() {
    navigate("/login", { replace: true });
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
          incomingCount={incoming.length}
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
              incomingCount={incoming.length}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      )}
    </>
  );
}

export { AppSidebar };
