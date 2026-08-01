import { Button } from "@/components/ui/button";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { VouchBadge } from "@/components/badge/VouchBadge";
import { toast } from "@/lib/toast";

function AppBusinessCard({ business }) {
  const initial = business.name.charAt(0);

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-lg font-semibold text-background">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">{business.name}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {business.industry} · {business.corridor}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <AppTierBadge tier={business.tier} />
        <VouchBadge ladder={business.ladder} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{business.vouchesReceived}</span> vouches
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => toast.success(`Vouched for ${business.name}`)}
        >
          Vouch
        </Button>
      </div>
    </div>
  );
}

export { AppBusinessCard };
