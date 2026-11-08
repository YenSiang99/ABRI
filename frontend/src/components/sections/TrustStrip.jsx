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
    { icon: BadgeCheck, value: format(stats?.verifiedBusinesses), label: "Verified businesses on ABRI", short: "Verified businesses" },
    { icon: Building2, value: format(MALAYSIA_MSMES), label: "MSMEs in Malaysia", short: "MSMEs in Malaysia" },
    { icon: Handshake, value: format(stats?.publishedEndorsements), label: "Endorsements given on ABRI", short: "Endorsements given" },
  ];

  return (
    <div className="border-b border-grey-200 bg-white dark:border-border dark:bg-card">
      <div className={cn(CONTAINER, "grid grid-cols-3 gap-3 sm:gap-4")}>
        {items.map(({ icon: Icon, value, label, short }, i) => (
          <div
            key={label}
            className={cn(
              "flex flex-col items-center gap-1 py-5 text-center sm:flex-row sm:gap-3.5 sm:py-[26px] sm:text-left",
              i === 1 && "sm:justify-center",
              i === 2 && "sm:justify-end",
            )}
          >
            <div className="hidden size-[60px] flex-none sm:grid place-items-center rounded-[10px] bg-yellow">
              <Icon className="size-[30px] text-ink" strokeWidth={1.8} aria-hidden />
            </div>
            <div>
              <p className="font-display text-[22px] leading-[1.1] font-bold tracking-[-0.02em] text-ink sm:text-[30px] lg:text-[36px] dark:text-foreground">
                {value}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-grey-600 sm:text-[14px] dark:text-muted-foreground">
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { TrustStrip };
