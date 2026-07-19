import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  UserCircle,
  Handshake,
  Compass,
  LogOut,
  X,
  ShieldCheck,
  Mailbox,
  CreditCard,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { introductions } from "@/data/appMockData";

const WORKSPACE_ITEMS = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "My Profile", url: "/app/profile", icon: UserCircle },
  { title: "Vouches", url: "/app/vouches", icon: Handshake, lockWhenPending: true },
  { title: "Network", url: "/app/network", icon: Compass },
];

const TRUST_ITEMS = [
  { title: "Verification", url: "/app/verify", icon: ShieldCheck },
  { title: "Introductions", url: "/app/introductions", icon: Mailbox },
  { title: "NFC Card", url: "/app/card", icon: CreditCard, lockWhenPending: true },
];

const pendingIntros = introductions.filter((i) => i.direction === "incoming" && i.status === "pending").length;

function SidebarNav({ pathname, onNavigate, business, locked, onSignOut }) {
  const isActive = (url) => (url === "/app" ? pathname === "/app" : pathname.startsWith(url));

  return (
    <>
      <Link to="/" className="flex items-center gap-2 px-4 py-4" onClick={onNavigate}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-bold text-background">
          A
        </div>
        <span className="text-base font-semibold tracking-tight text-foreground">ABRI</span>
      </Link>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
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
            </Link>
          ))}
        </div>

        <div className="mt-5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Trust
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {TRUST_ITEMS.map((item) => (
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
              {item.url === "/app/introductions" && pendingIntros > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
                  {pendingIntros}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
            {business.name.charAt(0)}
          </div>
          <div className="flex min-w-0 flex-col text-left">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{business.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {business.ssm ? `SSM ${business.ssm}` : "SSM pending"}
            </span>
          </div>
        </div>
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
  const { business, logout } = useAuth();

  if (!business) return null;

  const locked = business.tier === "T1";

  // No explicit navigate() here — ProtectedRoute (wrapping every /app/*
  // route this sidebar renders inside) redirects to /login as soon as
  // isAuthenticated flips false, so this just needs to flip that flag.
  function handleSignOut() {
    logout();
  }

  return (
    <>
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar">
        <SidebarNav pathname={pathname} business={business} locked={locked} onSignOut={handleSignOut} />
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
              locked={locked}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      )}
    </>
  );
}

export { AppSidebar };
