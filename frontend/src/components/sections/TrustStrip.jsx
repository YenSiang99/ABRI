import { useEffect, useState } from "react";
import { BadgeCheck, Building2, Handshake } from "lucide-react";

import { fetchPublicStats } from "@/lib/api/businesses";
import { CONTAINER } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// Malaysia's MSME count, a fixed national figure (from the homepage draft),
// not something ABRI measures. The other two are live from GET /businesses/stats.
const MALAYSIA_MSMES = 1069831;

function TrustStrip() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchPublicStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const format = (n) => (typeof n === "number" ? n.toLocaleString("en-MY") : "—");

  const items = [
    { icon: BadgeCheck, value: format(stats?.verifiedBusinesses), label: "Verified businesses on ABRI" },
    { icon: Building2, value: format(MALAYSIA_MSMES), label: "MSMEs in Malaysia" },
    { icon: Handshake, value: format(stats?.publishedEndorsements), label: "Endorsements given on ABRI" },
  ];

  return (
    <div className="border-b border-grey-200 bg-white dark:border-border dark:bg-card">
      <div className={cn(CONTAINER, "grid gap-4 sm:grid-cols-3")}>
        {items.map(({ icon: Icon, value, label }, i) => (
          <div
            key={label}
            className={cn(
              "flex items-center gap-3.5 py-5 sm:py-7",
              i === 1 && "sm:justify-center",
              i === 2 && "sm:justify-end",
            )}
          >
            <div className="grid size-11 flex-none place-items-center rounded-xl bg-yellow">
              <Icon className="size-5 text-yellow-ink" aria-hidden />
            </div>
            <div>
              <p className="text-[clamp(24px,2.8vw,32px)] leading-[1.15] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
                {value}
              </p>
              <p className="mt-0.5 text-[14.5px] text-grey-600 dark:text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { TrustStrip };
