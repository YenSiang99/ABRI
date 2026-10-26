import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search } from "lucide-react";

import { fetchDirectoryFacets } from "@/lib/api/businesses";
import { Eyebrow } from "@/components/sections/Eyebrow";
import { BTN_PRIMARY, CONTAINER, H2, LEAD, SECTION_HEAD, SECTION_Y } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// Each tag opens the directory filtered to a real category, so the shortcut
// lands on the same results the directory's own dropdown would.
const POPULAR = [
  { label: "Accounting", category: "Accounting & Tax" },
  { label: "Legal", category: "Law" },
  { label: "IT & software", category: "IT Consulting" },
  { label: "Logistics", category: "Logistics" },
  { label: "Marketing", category: "Marketing & Media" },
];

// The search box hands off to /directory, which reads ?q=, ?category= and
// ?location= as its starting filters. The location list is the directory's
// own facets, so it only offers areas that have businesses.
function Discover() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    fetchDirectoryFacets()
      .then((data) => setLocations(data.locations.map((l) => l.value)))
      .catch(() => setLocations([]));
  }, []);

  function goToDirectory(params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    navigate(`/directory${qs ? `?${qs}` : ""}`);
  }

  function handleSubmit(e) {
    e.preventDefault();
    goToDirectory({ q: query.trim(), location });
  }

  const field = "flex min-w-0 items-center gap-3 px-3.5 text-grey-400 dark:text-muted-foreground";
  const control =
    "w-full min-w-0 border-0 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-grey-500 dark:text-foreground";

  return (
    <section id="discover" className={cn(CONTAINER, SECTION_Y)}>
      <div className={cn(SECTION_HEAD, "mx-auto text-center")}>
        <Eyebrow>Your next connection is out there</Eyebrow>
        <h2 className={H2}>Find the right business partner.</h2>
        <p className={LEAD}>Search by industry, location and expertise.</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-[900px] items-center gap-1 rounded-sm border border-grey-300 bg-white p-2 sm:grid-cols-[1fr_210px_auto] sm:gap-0 sm:p-1.5 dark:border-border dark:bg-card"
      >
        <label className={cn(field, "border-b border-grey-200 sm:border-b-0 dark:border-border")}>
          <Search className="size-4 flex-none" aria-hidden />
          <span className="sr-only">Industry, service or expertise</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Industry, service or expertise"
            autoComplete="off"
            className={control}
          />
        </label>
        <label
          className={cn(
            field,
            "border-b border-grey-200 sm:border-b-0 sm:border-l dark:border-border",
          )}
        >
          <MapPin className="size-4 flex-none" aria-hidden />
          <span className="sr-only">Location</span>
          <select value={location} onChange={(e) => setLocation(e.target.value)} className={control}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={BTN_PRIMARY}>
          <Search className="size-4" aria-hidden />
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[13px] text-grey-500 dark:text-muted-foreground">
        <span className="mr-1">Popular searches</span>
        {POPULAR.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => goToDirectory({ category: p.category })}
            className="rounded-full border border-grey-300 px-3 py-1 text-[13px] font-semibold text-grey-600 transition-colors hover:bg-surface-2 hover:text-ink dark:border-border dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export { Discover };
