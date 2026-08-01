import { useState } from "react";
import { Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VouchListItem } from "@/components/app/VouchListItem";
import { VouchDialog } from "@/components/app/VouchDialog";
import { LockedFeature } from "@/components/app/LockedFeature";
import { useAuth } from "@/context/AuthContext";
import { useBusinesses, listVouchesGivenBy } from "@/lib/store/businesses";

function Vouches() {
  const { business } = useAuth();
  const allBusinesses = useBusinesses();
  const locked = business.tier === "T1";

  const [open, setOpen] = useState(false);

  const givenVouches = locked ? [] : listVouchesGivenBy(business.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            The give-first engine
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Vouches
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Real peers staking their reputation on real businesses. Give a vouch, unlock the next tier.
          </p>
        </div>

        {locked ? (
          <div className="text-sm text-muted-foreground">Vouching unlocks after SSM verification.</div>
        ) : (
          <>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Vouch for a business
            </Button>
            <VouchDialog open={open} onOpenChange={setOpen} businesses={allBusinesses} />
          </>
        )}
      </div>

      <Tabs defaultValue="received" className="mt-8">
        <TabsList>
          <TabsTrigger value="received">Received ({locked ? 0 : business.vouches.length})</TabsTrigger>
          <TabsTrigger value="given">Given ({givenVouches.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="mt-6 grid gap-4 md:grid-cols-2">
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouches locked"
                description="Vouches you receive will appear here once your SSM verification is complete."
              />
            </div>
          ) : business.vouches.length > 0 ? (
            business.vouches.map((v) => <VouchListItem key={v.id} vouch={v} mode="received" />)
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">No vouches yet.</p>
          )}
        </TabsContent>

        <TabsContent value="given" className="mt-6 grid gap-4 md:grid-cols-2">
          {locked ? (
            <div className="md:col-span-2">
              <LockedFeature
                title="Vouching locked"
                description="You can vouch for other businesses once your SSM verification is complete."
              />
            </div>
          ) : givenVouches.length > 0 ? (
            givenVouches.map((v) => <VouchListItem key={v.id} vouch={v} mode="given" />)
          ) : (
            <p className="text-sm text-muted-foreground md:col-span-2">No vouches given yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { Vouches };
