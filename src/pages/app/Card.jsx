import { Radio, Package, MapPin, Eye, Zap, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/app/StatCard";
import { LockedFeature } from "@/components/app/LockedFeature";
import { useAuth } from "@/context/AuthContext";
import { nfcTaps } from "@/data/appMockData";
import { toast } from "@/lib/toast";

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function Card() {
  const { business } = useAuth();

  if (business.tier === "T1") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Physical trust token
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">Your NFC card</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Every tap leads with verification status, not your job title. Real proof, in someone's hand.
          </p>
        </div>
        <div className="mt-8">
          <LockedFeature
            title="NFC card unlocks after SSM verification"
            description="Once our team confirms your SSM registration, your founding-member card ships and taps start showing up here."
          />
        </div>
      </div>
    );
  }

  const totalTaps = nfcTaps.length;
  const converted = nfcTaps.filter((t) => t.ledToProfileView).length;
  const rate = Math.round((converted / totalTaps) * 100);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Physical trust token
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">Your NFC card</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Every tap leads with verification status, not your job title. Real proof, in someone's hand.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="relative aspect-[1.586/1] overflow-hidden rounded-3xl border border-foreground/10 bg-foreground p-8 text-background shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-60">
                  ABRI · Verified Business Network
                </div>
                <div className="mt-8 text-2xl font-semibold tracking-tight">{business.name}</div>
                <div className="mt-0.5 text-sm opacity-70">{business.category}</div>
                <div className="mt-1 text-xs opacity-50">{business.location}</div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
                A
              </div>
            </div>
            <div className="absolute right-8 bottom-6 left-8 flex items-end justify-between font-mono text-[10px] opacity-70">
              <span>
                SSM {business.ssm} · Tier {business.tier}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Radio className="h-3 w-3" /> TAP TO VERIFY
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-lg font-semibold text-foreground">Active</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Founding batch · shipped Jan 2026</div>

          <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
            <Row label="Card ID" value="ABRI-0187" mono />
            <Row label="Chip" value="NTAG 424 DNA" />
            <Row label="Landing URL" value={`abri.my/m/${business.id}`} mono />
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button variant="secondary" onClick={() => toast.success("QR fallback downloaded")}>
              <Download className="mr-1.5 h-4 w-4" /> Download QR fallback
            </Button>
            <Button variant="outline" onClick={() => toast("Replacement request sent · RM50")}>
              <Package className="mr-1.5 h-4 w-4" /> Request replacement (RM50)
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total taps" value={totalTaps} hint="Last 7 days" icon={Zap} />
        <StatCard label="Led to profile view" value={converted} hint={`${rate}% conversion`} icon={Eye} />
        <StatCard
          label="Unique locations"
          value={new Set(nfcTaps.map((t) => t.location)).size}
          hint="Klang Valley corridor"
          icon={MapPin}
        />
      </div>

      <div className="mt-10">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tap history</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Recent activity</h2>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {nfcTaps.map((tap) => (
              <li key={tap.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Radio className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{tap.location}</div>
                  <div className="text-xs text-muted-foreground">
                    {tap.device} · {tap.date}
                  </div>
                </div>
                {tap.ledToProfileView ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                    <Eye className="h-3 w-3" /> Viewed profile
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No follow-through</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export { Card };
