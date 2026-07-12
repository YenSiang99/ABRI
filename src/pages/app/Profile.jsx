import { Pencil, Radio, MapPin, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { VouchBadge } from "@/components/badge/VouchBadge";
import { VouchListItem } from "@/components/app/VouchListItem";
import { currentUser, vouchesReceived } from "@/data/appMockData";
import { toast } from "@/lib/toast";

function Stat({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function Profile() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-2xl font-semibold text-background">
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Member profile
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {currentUser.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" /> {currentUser.industry}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {currentUser.corridor}
                </span>
                <span>Member since {currentUser.memberSince}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <AppTierBadge tier={currentUser.tier} />
                <VouchBadge ladder={currentUser.ladder} />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  <Radio className="h-3 w-3" /> Live
                </span>
              </div>
            </div>
          </div>
          <Button variant="secondary" onClick={() => toast("Edit coming soon")}>
            <Pencil className="mr-1.5 h-4 w-4" /> Edit profile
          </Button>
        </div>

        <div className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">SSM Record</div>
            <div className="mt-1 font-mono text-sm text-foreground">Reg. {currentUser.ssm}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Vouches Received</div>
            <div className="mt-1 text-sm text-foreground">{currentUser.vouchesReceived} peers</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Vouches Given</div>
            <div className="mt-1 text-sm text-foreground">{currentUser.vouchesGiven} peers</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="vouches">Vouches ({vouchesReceived.length})</TabsTrigger>
          <TabsTrigger value="card">NFC Card</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{currentUser.about}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Services</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {currentUser.services.map((s) => (
                <span key={s} className="rounded-full border border-border bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vouches" className="mt-6 grid gap-4 md:grid-cols-2">
          {vouchesReceived.map((v) => (
            <VouchListItem key={v.id} vouch={v} mode="received" />
          ))}
        </TabsContent>

        <TabsContent value="card" className="mt-6">
          <div className="rounded-3xl border border-border bg-card p-6">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Your NFC card
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              Physical trust token
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Verification status renders before contact details on every tap.
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl border border-foreground/10 bg-foreground p-6 text-background shadow-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-widest opacity-60">
                      ABRI · Verified
                    </div>
                    <div className="mt-6 text-xl font-semibold">{currentUser.name}</div>
                    <div className="text-xs opacity-70">{currentUser.industry}</div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
                    A
                  </div>
                </div>
                <div className="absolute right-6 bottom-5 left-6 flex items-end justify-between font-mono text-[10px] opacity-70">
                  <span>SSM {currentUser.ssm}</span>
                  <span>TAP TO VERIFY</span>
                </div>
              </div>

              <div className="flex flex-col justify-center gap-4">
                <Stat label="Card taps this month" value="23" />
                <Stat label="Leads captured" value="8" />
                <Stat label="Status" value="Active · Founding batch" />
                <Button variant="outline" onClick={() => toast("Replacement request sent")}>
                  Request replacement (RM50)
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { Profile };
