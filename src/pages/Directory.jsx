import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

import { businesses } from "@/data/businesses";
import { BusinessCard } from "@/components/business/BusinessCard";

const TIER_FILTERS = [
  { value: "all", label: "All" },
  { value: "T0", label: "Unclaimed" },
  { value: "T1", label: "Claimed" },
  { value: "T2", label: "SSM-Verified" },
];

function Directory() {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const q = query.trim().toLowerCase();
  const filtered = businesses.filter((b) => {
    const matchesQuery =
      !q ||
      b.name.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q);
    const matchesTier = tierFilter === "all" || b.tier === tierFilter;
    return matchesQuery && matchesTier;
  });

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-16">
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase">
        The verified business network
      </span>
      <h1 className="mt-3 text-[clamp(28px,3.4vw,38px)] font-extrabold tracking-[-0.02em] text-ink">
        Directory
      </h1>
      <p className="mt-2 max-w-[36rem] text-[15px] text-grey-600">
        Browse businesses seeded from public registry data, claimed by their
        owners, and SSM-verified.
      </p>

      <div className="relative mt-8 max-w-md">
        <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-grey-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or category"
          className="w-full rounded-sm border border-grey-300 py-2.5 pr-3.5 pl-10 text-sm text-ink outline-none focus:border-ink"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TIER_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setTierFilter(filter.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              tierFilter === filter.value
                ? "border-ink bg-ink text-yellow"
                : "border-grey-300 text-grey-600 hover:bg-surface-2",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[13px] text-grey-500">
        {filtered.length} {filtered.length === 1 ? "business" : "businesses"}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center text-grey-500">
          {q
            ? `No businesses match "${query}".`
            : "No businesses match this filter."}
        </div>
      )}
    </div>
  );
}

export { Directory };
