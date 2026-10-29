import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Radio,
  History,
  UserCircle,
  Handshake,
  Search,
  LogOut,
  X,
  ShieldCheck,
  CreditCard,
  Receipt,
  Lock,
  ClipboardCheck,
  Flag,
  Inbox,
  Users,
  Eye,
  Building2,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useConnections } from "@/context/ConnectionsContext";
import { useNotifications } from "@/context/NotificationsContext";
import { verificationLevelLabel } from "@/lib/trustLabels";
import {
  membershipTierLabel,
  canUpgradeFromMembershipTier,
  membershipTierAllows,
} from "@/lib/membershipTiers";
import { CLAIMED } from "@/lib/verificationLevels";
import { AbriMark } from "@/components/layout/AbriMark";

// THE NAV IS GROUPED BY QUESTION, not by feature area. Each group answers one:
//
//   (top)        what needs me, and what happened
//   Find         who is out there
//   My business  how do I look
//
// WHAT CHANGED (Sep 2026) and why. The previous shape was one "Workspace"
// group of eight plus a "Trust" group of two, and it had three specific
// faults:
//
//   FOUR INBOXES. "What needs me?" was four badges on four rows in two
//     groups — unread on Dashboard, endorsement turns on Endorsements, work waiting to
//     be confirmed, and connection requests two levels deep under Network.
//     The badge
//     doctrine below was right; the placement made a member assemble one
//     answer from four places. /app/inbox now owns the three that are WORK,
//     and carries their combined count.
//
//   MY BUSINESS WAS SPLIT. Profile sat in Workspace while Verification and
//     the NFC card sat in Trust, and "Trust" was a weak name for the pair —
//     endorsements, checks and viewers are all trust surfaces too. It read as the
//     leftovers group.
//
//   PLAN WAS NOT IN THE NAV AT ALL. Every LockedFeature in the app ends in
//     "See tiers →" pointing at /app/plan, and the only standing entry point
//     was the tier chip at the foot of this sidebar. The upsells outnumbered
//     the doors.
//
// NETWORK IS NO LONGER NESTED. Its children were requests, connections and
// following; requests moved into the Inbox, and a two-item accordion costs a
// click to reach rows that fit perfectly well at the top level. If a fourth
// relationship type arrives (Groups was the one this nesting was paying
// forward for), nest it again then — with four children the trade is worth
// making, and it was not with two.
const TOP_ITEMS = [
  { title: "Home", url: "/app", icon: LayoutDashboard },
  // The one row whose badge counts work rather than news. See Inbox.jsx on
  // why unread feed activity is deliberately not part of that number.
  { title: "Inbox", url: "/app/inbox", icon: Inbox },
  // Kept as its own row even though the dashboard embeds the feed. /app/feed
  // is a real page with more than the dashboard shows, and dropping the row
  // would leave it reachable only by typing the URL.
  { title: "Feed", url: "/app/feed", icon: Radio },
];

// Outward-facing: the three ways to find or check somebody else.
const FIND_ITEMS = [
  { title: "Directory", url: "/app/directory", icon: Search },
  // Sits with Directory because that is where checks are made — a record
  // belongs beside the thing it records. No lockFeature: the page has a free
  // half (the viewers count), and a padlock would shut it to exactly the
  // member it has the most to offer.
  { title: "Checks & viewers", url: "/app/checks", icon: History },
];

// Inward-facing: this member's own standing, in the order someone would set
// it up — who I am, what backs me, who I know, what I have proved, what I pay.
//
// Two independent reasons an item can be shut, so two fields rather than one:
// lockWhenPending is verification (level L1), lockFeature is the plan. The NFC
// card is behind both, and the page itself decides which message to show when
// they overlap.
const BUSINESS_ITEMS = [
  { title: "Profile", url: "/app/profile", icon: UserCircle },
  // The record of endorsements given and received. The ones WAITING on this member
  // are in the Inbox; this page is where the finished relationship lives.
  {
    title: "Endorsements",
    url: "/app/endorsements",
    icon: Handshake,
    lockWhenPending: true,
  },
  { title: "Connections", url: "/app/network/connections", icon: Users },
  { title: "Following", url: "/app/network/following", icon: Eye },
  { title: "Verification", url: "/app/verify", icon: ShieldCheck },
  // The page every upsell in the product already points at.
  { title: "Plan", url: "/app/plan", icon: Receipt },
  {
    title: "NFC Card",
    url: "/app/card",
    icon: CreditCard,
    lockWhenPending: true,
    lockFeature: "nfcCard",
  },
];

// The admin's two queues are siblings, and the sidebar is where that has to
// be visible. Endorsement review used to be reachable only through a link on the
// claims page, which read as though flagged endorsements were part of claim
// review — a different job on different records.
// An account with no approved business (see AppLayout's CLAIMANT_PATHS):
// its claim, and the directory. Nothing else would load for it.
//
// The rest of the member nav is still shown beneath these, dimmed, so a
// claimant can see what they're claiming into. Every dimmed row leads back to
// the claim screen. One caption over the lot rather than a padlock per row:
// the padlock already means "verify" or "upgrade", and a third meaning on ten
// rows would blur all three and bury the one thing they can actually do.
const CLAIMANT_ITEMS = [
  { title: "Your claim", url: "/app", icon: LayoutDashboard },
  { title: "Directory", url: "/app/directory", icon: Search },
];

const ADMIN_ITEMS = [
  { title: "Claims review", url: "/app/admin", icon: ClipboardCheck },
  { title: "Endorsement review", url: "/app/admin/endorsement-reviews", icon: Flag },
  // A third queue, and the one that makes L2 real: until it existed an
  // admin granted SSM-Verified from the claims screen with no number in front
  // of them. See pages/admin/AdminSsmReviews.jsx.
  { title: "SSM review", url: "/app/admin/ssm-reviews", icon: ShieldCheck },
  // Add, edit and delete listings by hand, for setting up claim tests.
  { title: "Businesses", url: "/app/admin/businesses", icon: Building2 },
  // Delete stuck or unwanted accounts so the email can sign up again.
  { title: "Users", url: "/app/admin/users", icon: UserCog },
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
function NavRow({
  item,
  active,
  onNavigate,
  locked = false,
  dimmed = false,
  depth = 0,
  children,
}) {
  return (
    <Link
      to={dimmed ? "/app" : item.url}
      onClick={onNavigate}
      title={dimmed ? "Claim your business to unlock" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
        depth === 0 ? "px-2.5" : "py-1.5 pr-2.5 pl-8 text-[13px]",
        dimmed
          ? "text-sidebar-foreground/70 opacity-50 hover:opacity-70"
          : active
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

function SidebarNav({
  pathname,
  onNavigate,
  business,
  claim,
  isAdmin,
  locked,
  unreadCount,
  endorsementActionCount,
  portfolioCount,
  incomingCount,
  onSignOut,
}) {
  // Prefix match, except for the urls that are prefixes of their own
  // children — /app is under everything, /app/admin is under
  // /app/admin/endorsement-reviews, and /app/network is under all three of its own
  // children. Those need an exact match or they'd light up alongside the
  // child that's actually open. (/app/network never renders as a row at all,
  // but it goes in the set anyway so the next reader doesn't have to work out
  // why one section parent is missing.)
  const EXACT = new Set(["/app", "/app/admin", "/app/network"]);
  const isActive = (url) =>
    EXACT.has(url) ? pathname === url : pathname.startsWith(url);

  return (
    <>
      <Link
        to="/"
        className="flex items-center gap-2 px-4 py-4"
        onClick={onNavigate}
      >
        <AbriMark className="h-7 shrink-0" />
        <span className="text-base font-semibold tracking-tight text-foreground">
          ABRI
        </span>
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
        ) : !business ? (
          <>
            <div className="flex flex-col gap-1">
              {CLAIMANT_ITEMS.map((item) => (
                <NavRow
                  key={item.title}
                  item={item}
                  active={isActive(item.url)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>

            <div className="mt-5 px-2 text-xs text-muted-foreground">
              {claim?.status === "pending"
                ? "Unlocks when your claim is approved"
                : "Unlocks once you claim your business"}
            </div>
            {/* Home and Directory are left out: both are already live above. */}
            {[
              { label: null, items: TOP_ITEMS.filter((i) => i.url !== "/app") },
              { label: "Find", items: FIND_ITEMS.filter((i) => i.url !== "/app/directory") },
              { label: "My business", items: BUSINESS_ITEMS },
            ].map((group) => (
              <div key={group.label ?? "top"}>
                {group.label && (
                  <div className="mt-5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground opacity-50">
                    {group.label}
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-1">
                  {group.items.map((item) => (
                    <NavRow
                      key={item.title}
                      item={item}
                      onNavigate={onNavigate}
                      dimmed
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {/* No group label. These two are the front door — a header above
                them would name a category nobody arrived looking for. */}
            <div className="flex flex-col gap-1">
              {TOP_ITEMS.map((item) => (
                <NavRow
                  key={item.title}
                  item={item}
                  active={isActive(item.url)}
                  onNavigate={onNavigate}
                >
                  {/* Unread feed activity. NEWS, not work — it stays on Home
                      rather than joining the Inbox count, because nothing is
                      owed by a feed item and folding it in would make the
                      Inbox number mean "things that happened". */}
                  {item.url === "/app" && (
                    <NavBadge count={unreadCount} label="unread" />
                  )}
                  {/* THE ONE WORK BADGE, and the reason this row exists. The
                      counts that used to sit on Endorsements and Network ›
                      Requests are summed here, because the Inbox is the page
                      that can clear them all — which is exactly what
                      the badge doctrine asks of whatever a count points at.

                      endorsementActionCount is NOT suppressed while `locked`, unlike
                      the old Endorsements badge: the Inbox is not a LockedFeature,
                      so the work behind this number is genuinely openable. A
                      Free member's endorsement requests are real and readable in
                      full; only publishing one is priced, and the nag is the
                      pitch. */}
                  {item.url === "/app/inbox" && (
                    <NavBadge
                      count={
                        endorsementActionCount + incomingCount + portfolioCount
                      }
                      label="waiting on you"
                    />
                  )}
                </NavRow>
              ))}
            </div>

            <div className="mt-5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Find
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {FIND_ITEMS.map((item) => (
                <NavRow
                  key={item.title}
                  item={item}
                  active={isActive(item.url)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>

            <div className="mt-5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              My business
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {BUSINESS_ITEMS.map((item) => {
                const planLocked =
                  item.lockFeature &&
                  !membershipTierAllows(
                    business?.membershipTier,
                    item.lockFeature,
                  );
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
        {!isAdmin && !business && (
          <div className="flex min-w-0 flex-col rounded-lg px-2 py-2 text-left">
            <span className="truncate text-sm font-medium text-sidebar-foreground">
              {claim?.business?.name ?? "No business yet"}
            </span>
            <Link
              to="/app"
              className="truncate text-xs text-muted-foreground hover:text-sidebar-foreground"
            >
              {claim?.status === "pending"
                ? "Claim pending review"
                : claim?.status === "rejected"
                  ? "Claim not approved"
                  : "Claim your business"}
            </Link>
          </div>
        )}
        {!isAdmin && business && (
          <>
            <div className="flex items-center gap-2 rounded-lg px-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
                {business.name.charAt(0)}
              </div>
              <div className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {business.name}
                </span>
                <Link
                  to="/app/verify"
                  className="truncate text-xs text-muted-foreground hover:text-sidebar-foreground"
                >
                  {verificationLevelLabel[business.verificationLevel] ??
                    business.verificationLevel}
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
                  endorsement level        — rounded-full pill, inline icon
                  membership tier    — squared rounded-sm mono chip, muted

                Squared rather than the circular mark VerificationBadge uses
                or the pill EndorsementBadge uses, so it can't be misread as a rank
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
                {/* Not for Founding members: they pay nothing while the
                    founding period lasts, so there is nothing to upgrade to. */}
                {canUpgradeFromMembershipTier(business.membershipTier) && business.membershipTierGrant !== "founding" && (
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
  const { business, claim, isAdmin, logout } = useAuth();
  const { unreadCount, endorsementActionCount, portfolioCount } =
    useNotifications();
  // Requests waiting on THIS member, for the Network badge. Read here rather
  // than inside NavSection so the sidebar has one place that talks to
  // contexts, matching how the other two counts arrive.
  const { incoming } = useConnections();

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
          claim={claim}
          isAdmin={isAdmin}
          locked={locked}
          unreadCount={unreadCount}
          endorsementActionCount={endorsementActionCount}
          portfolioCount={portfolioCount}
          incomingCount={incoming.length}
          onSignOut={handleSignOut}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onCloseMobile}
          />
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
          claim={claim}
              isAdmin={isAdmin}
              locked={locked}
              unreadCount={unreadCount}
              endorsementActionCount={endorsementActionCount}
              portfolioCount={portfolioCount}
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
