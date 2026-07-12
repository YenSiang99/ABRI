import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, UserCircle, Handshake, Compass, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { currentUser } from "@/data/appMockData";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "My Profile", url: "/app/profile", icon: UserCircle },
  { title: "Vouches", url: "/app/vouches", icon: Handshake },
  { title: "Network", url: "/app/network", icon: Compass },
];

function SidebarNav({ pathname, onNavigate }) {
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
          {NAV_ITEMS.map((item) => (
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
              {item.title}
            </Link>
          ))}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">
            {currentUser.name.charAt(0)}
          </div>
          <div className="flex min-w-0 flex-col text-left">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{currentUser.name}</span>
            <span className="truncate text-xs text-muted-foreground">SSM {currentUser.ssm}</span>
          </div>
        </div>
        <Link
          to="/"
          onClick={onNavigate}
          className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Link>
      </div>
    </>
  );
}

function AppSidebar({ mobileOpen, onCloseMobile }) {
  const { pathname } = useLocation();

  return (
    <>
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar">
        <SidebarNav pathname={pathname} />
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
            <SidebarNav pathname={pathname} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}

export { AppSidebar };
