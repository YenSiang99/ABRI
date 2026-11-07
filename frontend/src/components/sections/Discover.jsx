import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Search } from "lucide-react";

import { fetchDirectoryFacets } from "@/lib/api/businesses";
import { Eyebrow } from "@/components/sections/Eyebrow";
import { BTN_LG, BTN_PRIMARY, CONTAINER, H2 } from "@/components/sections/marketing";
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

  const field = "flex min-w-0 items-center gap-2.5 px-4 text-grey-600";
  const control =
    "h-[52px] w-full min-w-0 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-grey-500";

  return (
    <section id="discover" className={cn(CONTAINER, "pt-16 md:pt-24")}>
      <div className="grid items-center gap-8 rounded-[28px] bg-ink px-5 py-8 text-white sm:rounded-[36px] sm:px-12 sm:py-11 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-10 dark:border dark:border-border dark:bg-card">
        <div>
          <Eyebrow className="text-yellow dark:text-yellow">Your next connection is out there</Eyebrow>
          <h2 className={cn(H2, "text-white sm:text-[34px] lg:text-[36px] dark:text-white")}>Find the right business partner.</h2>
          <p className="mt-2 text-[16px] text-[#D6D4CE]">Search by industry, location and expertise.</p>
        </div>

        <div>
          <form
            onSubmit={handleSubmit}
            role="search"
            className="grid gap-1 rounded-[20px] bg-white p-1.5 text-ink sm:grid-cols-[1fr_190px_auto] sm:items-center sm:gap-0 sm:rounded-full"
          >
            <label className={field}>
              <Search className="size-[18px] flex-none" aria-hidden />
              <span className="sr-only">Industry, service or expertise</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Industry, service or expertise"
                autoComplete="off"
                className={control}
              />
            </label>
            <label className={cn(field, "border-t border-grey-200 sm:border-t-0 sm:border-l")}>
              <MapPin className="size-[18px] flex-none" aria-hidden />
              <span className="sr-only">Location</span>
              <select value={location} onChange={(e) => setLocation(e.target.value)} className={control}>
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <button type="submit" className={cn(BTN_PRIMARY, BTN_LG, "sm:rounded-full")}>
              <Search className="size-4" aria-hidden />
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px] text-[#D6D4CE]">
            <span className="mr-1">Popular</span>
            {POPULAR.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => goToDirectory({ category: p.category })}
                className="rounded-full bg-white/10 px-3 py-1 text-[14px] text-white transition-colors hover:bg-yellow hover:text-ink"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export { Discover };
