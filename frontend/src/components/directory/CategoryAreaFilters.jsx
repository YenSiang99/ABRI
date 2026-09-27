import { useEffect, useState } from "react";

import { fetchDirectoryFacets } from "@/lib/api/businesses";

// The directory's two filters, shared by the public directory and the in-app
// one. Built from GET /businesses/facets, so they only ever offer a category
// or area that has businesses in it, with the count beside it — a filter that
// always comes back empty makes a directory look deserted. They replaced the
// verification chips and the "Doing [service]" dropdown on 27 Sep 2026: with
// 140,000 unclaimed seed listings and no services on any of them, those were
// empty for almost every choice.
//
// Each list is counted within the other choice: pick "Law" and the areas show
// how many law firms each has.
function CategoryAreaFilters({ category, location, onChange, className = "" }) {
  const [facets, setFacets] = useState(null);

  useEffect(() => {
    let live = true;
    fetchDirectoryFacets({ category, location })
      .then((data) => live && setFacets(data))
      .catch(() => live && setFacets({ categories: [], locations: [] }));
    return () => {
      live = false;
    };
  }, [category, location]);

  const selectClass =
    "rounded-lg border border-grey-300 bg-white px-3 py-1.5 text-[13px] text-ink outline-none focus:border-ink dark:border-border dark:bg-background dark:text-foreground dark:focus:border-ring";

  // The chosen value stays in its list even before counts arrive, so the
  // select never shows a blank for a filter that is actually on.
  const withSelected = (options, selected) =>
    selected && !options.some((o) => o.value === selected) ? [{ value: selected }, ...options] : options;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select
        aria-label="Category"
        value={category}
        onChange={(e) => onChange({ category: e.target.value, location })}
        className={selectClass}
      >
        <option value="">All categories</option>
        {withSelected(facets?.categories ?? [], category).map((c) => (
          <option key={c.value} value={c.value}>
            {c.value}
            {c.count != null ? ` (${c.count.toLocaleString()})` : ""}
          </option>
        ))}
      </select>
      <select
        aria-label="Area"
        value={location}
        onChange={(e) => onChange({ category, location: e.target.value })}
        className={selectClass}
      >
        <option value="">All areas</option>
        {withSelected(facets?.locations ?? [], location).map((l) => (
          <option key={l.value} value={l.value}>
            {l.value}
            {l.count != null ? ` (${l.count.toLocaleString()})` : ""}
          </option>
        ))}
      </select>
      {(category || location) && (
        <button
          type="button"
          onClick={() => onChange({ category: "", location: "" })}
          className="text-[13px] text-grey-600 underline underline-offset-4 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export { CategoryAreaFilters };
