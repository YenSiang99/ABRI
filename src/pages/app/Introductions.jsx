import { useState } from "react";
import { ArrowRight, Check, X, Clock, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppTierBadge } from "@/components/badge/AppTierBadge";
import { introductions, getBusiness } from "@/data/appMockData";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function Introductions() {
  const incoming = introductions.filter((i) => i.direction === "incoming");
  const outgoing = introductions.filter((i) => i.direction === "outgoing");
  const pendingIn = incoming.filter((i) => i.status === "pending").length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Warm intros</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">Introductions</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Every request is routed through a mutual voucher, so it lands as a warm handshake — never a cold DM.
        </p>
      </div>

      <Tabs defaultValue="incoming" className="mt-8">
        <TabsList>
          <TabsTrigger value="incoming">
            Incoming{" "}
            {pendingIn > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">
                {pendingIn}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing">Sent ({outgoing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-6 space-y-4">
          {incoming.length === 0 ? (
            <EmptyState label="No incoming intros yet — keep vouching and they'll come." />
          ) : (
            incoming.map((intro) => <IntroCard key={intro.id} intro={intro} />)
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-6 space-y-4">
          {outgoing.length === 0 ? (
            <EmptyState label="You haven't asked for an intro yet. Browse the network to find someone." />
          ) : (
            outgoing.map((intro) => <IntroCard key={intro.id} intro={intro} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IntroCard({ intro }) {
  const [status, setStatus] = useState(intro.status);
  const requester = getBusiness(intro.requesterId);
  const target = getBusiness(intro.targetId);
  const via = getBusiness(intro.viaId);
  if (!requester || !target || !via) return null;

  const other = intro.direction === "incoming" ? requester : target;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <BusinessChip name={requester.name} muted={intro.direction === "outgoing"} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <BusinessChip name={via.name} accent label="via" />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <BusinessChip name={target.name} muted={intro.direction === "incoming"} />
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> {intro.date}
        </span>
      </div>

      <div className="mt-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
          {other.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{other.name}</span>
            <AppTierBadge tier={other.tier} />
            <span className="text-xs text-muted-foreground">· {other.industry}</span>
          </div>
          <blockquote className="mt-3 border-l-2 border-accent pl-4 text-sm italic text-foreground">
            "{intro.note}"
          </blockquote>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <StatusChip status={status} />
        {intro.direction === "incoming" && status === "pending" ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStatus("declined");
                toast(`Declined intro from ${requester.name}`);
              }}
            >
              <X className="mr-1 h-4 w-4" /> Decline
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setStatus("accepted");
                toast.success(`Accepted intro from ${requester.name}`);
              }}
            >
              <Check className="mr-1 h-4 w-4" /> Accept intro
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => toast(`Viewing full profiles is coming soon`)}>
            <Handshake className="mr-1.5 h-4 w-4" /> View profile
          </Button>
        )}
      </div>
    </div>
  );
}

function BusinessChip({ name, muted, accent, label }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        accent && "border-accent bg-accent/20 text-foreground",
        muted && "border-border bg-secondary text-muted-foreground",
        !accent && !muted && "border-foreground bg-foreground text-background",
      )}
    >
      {label && <span className="opacity-60">{label}</span>}
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/20 text-[9px] font-bold">
        {name.charAt(0)}
      </span>
      {name}
    </span>
  );
}

function StatusChip({ status }) {
  const map = {
    pending: { label: "Pending your reply", cls: "bg-secondary text-secondary-foreground border-border" },
    accepted: { label: "Accepted", cls: "bg-foreground text-background border-foreground" },
    declined: { label: "Declined", cls: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", s.cls)}>
      {s.label}
    </span>
  );
}

function EmptyState({ label }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export { Introductions };
