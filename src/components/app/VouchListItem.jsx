import { Button } from "@/components/ui/button";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { getBusiness } from "@/data/appMockData";
import { toast } from "@/lib/toast";

function VouchListItem({ vouch, mode }) {
  const otherId = mode === "received" ? vouch.fromId : vouch.toId;
  const other = getBusiness(otherId);
  if (!other) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
          {other.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{other.name}</span>
            <AppTierBadge tier={other.tier} />
          </div>
          <div className="text-xs text-muted-foreground">
            {other.industry} · {vouch.date}
          </div>
        </div>
      </div>

      <blockquote className="mt-4 border-l-2 border-accent pl-4 text-sm italic text-foreground">
        "{vouch.testimonial}"
      </blockquote>

      <div className="mt-4 flex gap-2">
        {mode === "received" ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => toast.success(`Thanked ${other.name}`)}>
              Thank
            </Button>
            <Button size="sm" onClick={() => toast.success(`Vouched back for ${other.name}`)}>
              Vouch back
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => toast(`Edit coming soon`)}>
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}

export { VouchListItem };
