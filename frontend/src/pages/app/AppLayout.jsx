import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";

import { AppSidebar } from "@/components/app/AppSidebar";
import { Toaster } from "@/components/ui/toaster";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuth } from "@/context/AuthContext";

function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();

  // Portaled content (dialogs, toasts) mounts to document.body, outside this
  // subtree, so the theme class has to live on body for them to inherit it.
  useEffect(() => {
    document.body.classList.add("app-theme");
    return () => document.body.classList.remove("app-theme");
  }, []);

  // Admin accounts have no business, so every other /app/* page (which
  // assumes one exists — see AppSidebar/Dashboard) would break for them.
  // Keep admins confined to the /app/admin subtree instead of teaching
  // each page about the admin case. A prefix rather than an equality check
  // so admin can have more than one screen (claims review, vouch review).
  if (isAdmin && !pathname.startsWith("/app/admin")) {
    return <Navigate to="/app/admin" replace />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="text-sm text-muted-foreground">The verified business network</div>
          <ThemeToggle className="ml-auto" />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export { AppLayout };
