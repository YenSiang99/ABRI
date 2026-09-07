import { useState } from "react";
import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UpgradePrompt, useUpgradeGate } from "@/components/app/UpgradePrompt";
import { watchBusiness, unwatchBusiness } from "@/lib/api/watches";
import { toast } from "@/lib/toast";

// "Tell me when this business gets claimed, or verified, or loses it."
//
// The Pro tool that turns a one-off check into a reason to come back — and
// the feature routes/follows.js named and declined to build: "'Tell me when
// this gets claimed' is a better feature and the reason to revisit that line."
//
// NOT A FOLLOW, and the difference is visible right here: this button is
// offered on UNCLAIMED listings, where Follow is refused. A follow watches
// what somebody does and an unclaimed listing does nothing; a watch watches a
// FACT, and "nobody has claimed this yet" is exactly the fact worth being
// told about.
//
// Fully styled below Pro, never hidden. The click is what the gate
// intercepts — the UpgradePrompt doctrine, and the only honest way to sell
// something: reach for it and be told the price, rather than never learning
// it existed.
function WatchButton({ business, watching, onChanged, size = "sm" }) {
  const gate = useUpgradeGate("watchBusinesses");
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (watching) {
        await unwatchBusiness(business.id);
        toast(`Stopped watching ${business.name}`);
      } else {
        await watchBusiness(business.id);
        // Says what it will actually do, and that nobody is told — the same
        // honesty the follow toast carries. A member who thinks watching
        // notifies the business has been misled by the button.
        toast.success(`Watching ${business.name}`, {
          description: "We'll tell you if their verification changes. They aren't notified.",
        });
      }
      await onChanged?.();
    } catch (err) {
      // A 402 that slipped past the client-side gate — a tier that lapsed
      // mid-session, say. Open the prompt rather than toasting what reads
      // like a fault.
      if (err.requiredMembershipTier) gate.setOpen(true);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={size} variant="outline" disabled={busy} onClick={gate.guard(toggle)}>
        {watching ? <BellOff className="mr-1.5 h-3.5 w-3.5" /> : <Bell className="mr-1.5 h-3.5 w-3.5" />}
        {watching ? "Watching" : "Watch"}
      </Button>
      <UpgradePrompt gate={gate} />
    </>
  );
}

export { WatchButton };
