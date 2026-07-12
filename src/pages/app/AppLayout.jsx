import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";

import { AppSidebar } from "@/components/app/AppSidebar";
import { Toaster } from "@/components/ui/toaster";

function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Portaled content (dialogs, toasts) mounts to document.body, outside this
  // subtree, so the theme class has to live on body for them to inherit it.
  useEffect(() => {
    document.body.classList.add("app-theme");
    return () => document.body.classList.remove("app-theme");
  }, []);

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
