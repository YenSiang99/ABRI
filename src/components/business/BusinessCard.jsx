import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { Button } from "@/components/ui/button";

function BusinessCard({
  business,
  basePath = "/business",
  connectable = false,
  alreadyConnected = false,
  onConnect,
  showActions = false,
}) {
  return (
    <Link
      to={`${basePath}/${business.id}`}
      className="block rounded-lg border border-grey-200 bg-white p-6 transition-shadow hover:shadow-md dark:border-border dark:bg-card"
    >
      <div className="flex items-start gap-4">
        <div className="grid size-12 flex-none place-items-center rounded-xl bg-ink text-lg font-extrabold text-yellow dark:bg-grey-700">
          {business.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-extrabold text-ink dark:text-foreground">
            {business.name}
          </div>
          <div className="mt-[3px] text-[13.5px] text-grey-600 dark:text-muted-foreground">
            {business.category} · {business.location}
          </div>
          <div className="mt-2.5">
            <VerificationBadge tier={business.tier} size="inline" chip />
          </div>
        </div>
      </div>
      <div className="mt-4 text-[13px] text-grey-500 dark:text-muted-foreground">
        {business.tier === "T1"
          ? "Vouches unlock after SSM verification"
          : business.vouchCount > 0
            ? `${business.vouchCount} vouches`
            : "No vouches yet"}
      </div>
      {showActions && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline">
            View Profile <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
          {connectable &&
            (alreadyConnected ? (
              <Button size="sm" variant="secondary" disabled>
                Connected
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onConnect(business);
                }}
              >
                Connect
              </Button>
            ))}
        </div>
      )}
    </Link>
  );
}

export { BusinessCard };
