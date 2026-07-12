import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppBusinessCard } from "@/components/app/AppBusinessCard";
import { businesses } from "@/data/appMockData";
import { cn } from "@/lib/utils";

const TIER_FILTERS = [
  { value: "all", label: "All tiers" },
  { value: "T1", label: "Claimed" },
  { value: "T2", label: "SSM-Verified" },
  { value: "T3", label: "Identity-Verified" },
];

const CORRIDORS = ["All corridors", ...Array.from(new Set(businesses.map((b) => b.corridor)))];

function Network() {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [corridor, setCorridor] = useState("All corridors");

  const results = businesses.filter((b) => {
    const matchesQ =
      !q || b.name.toLowerCase().includes(q.toLowerCase()) || b.industry.toLowerCase().includes(q.toLowerCase());
    const matchesTier = tier === "all" || b.tier === tier;
    const matchesCorridor = corridor === "All corridors" || b.corridor === corridor;
    return matchesQ && matchesTier && matchesCorridor;
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Directory
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          The verified network
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Real, SSM-verified businesses in the Klang Valley professional-services corridor.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-12 pl-10 text-base"
            placeholder="Search by business name or industry…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {TIER_FILTERS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTier(t.value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                tier === t.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 self-center text-border">·</span>
          {CORRIDORS.map((c) => (
            <button
              key={c}
              onClick={() => setCorridor(c)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                corridor === c
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 text-sm text-muted-foreground">
        {results.length} {results.length === 1 ? "business" : "businesses"}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((b) => (
          <AppBusinessCard key={b.id} business={b} />
        ))}
      </div>

      {results.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="text-sm text-muted-foreground">No businesses match those filters.</div>
        </div>
      )}
    </div>
  );
}

export { Network };
