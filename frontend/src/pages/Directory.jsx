import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";

import { fetchBusinessPage } from "@/lib/api/businesses";
import { Pagination } from "@/components/Pagination";
import { BusinessCard } from "@/components/business/BusinessCard";
import { CategoryAreaFilters } from "@/components/directory/CategoryAreaFilters";
import { Seo } from "@/components/Seo";
import { SITE_ORIGIN } from "@/lib/site";

function Directory() {
  // Page, filters, and search all live in the URL, so Back works and the same
  // directory state can be copied or shared. Changing a filter starts at page
  // one while the homepage can hand over ?q=, ?category= and ?location=.
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [place, setPlace] = useState(() => ({
    category: searchParams.get("category") ?? "",
    location: searchParams.get("location") ?? "",
  }));
  const [businesses, setBusinesses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(24);

  // Local input state is responsive while the debounced API request runs, but
  // browser Back/Forward must still restore filters from the URL. Comparing
  // values before setting keeps normal page/filter navigation from causing an
  // extra render or request.
  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    const urlCategory = searchParams.get("category") ?? "";
    const urlLocation = searchParams.get("location") ?? "";
    setQuery((current) => current === urlQuery ? current : urlQuery);
    setPlace((current) =>
      current.category === urlCategory && current.location === urlLocation
        ? current
        : { category: urlCategory, location: urlLocation },
    );
  }, [searchParams]);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const goTo = useCallback(
    (n, { replace = false } = {}) => {
      const next = new URLSearchParams();
      if (query.trim()) next.set("q", query.trim());
      if (place.category) next.set("category", place.category);
      if (place.location) next.set("location", place.location);
      if (n > 1) next.set("page", String(n));
      setSearchParams(next, { replace });
    },
    [place.category, place.location, query, setSearchParams],
  );

  // Compared by value, not run on every render of its dependencies:
  // setSearchParams (inside goTo) changes identity whenever the URL does, so
  // keying this on goTo would send every page click straight back to page 1.
  // The first render records the filters without resetting, so a visitor
  // arriving on ?page=3 stays on page 3.
  const filterKey = JSON.stringify([query, place.category, place.location]);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    goTo(1, { replace: true });
  }, [filterKey, goTo]);

  // Paged since Sep 2026. This route used to return every matching row on
  // every request, unauthenticated — the whole member list in one call, which
  // is the asset the product sells. Numbered pages since Sep 2026 too: one
  // page replaces the last rather than piling up under it.
  const load = useCallback(
    async (page) => {
      const data = await fetchBusinessPage({
        search: query.trim(),
        category: place.category || undefined,
        location: place.location || undefined,
        page,
      });
      setBusinesses(data.businesses);
      setTotal(data.total ?? data.businesses.length);
      setPageSize(data.pageSize ?? 24);
      // Past the end (an old link, or the list shrank): go to the last page
      // rather than showing an empty one that says nothing matches.
      if (data.businesses.length === 0 && data.total > 0) {
        goTo(Math.ceil(data.total / (data.pageSize ?? 24)), { replace: true });
      }
    },
    [query, place.category, place.location, goTo],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const timer = setTimeout(() => {
      load(page)
        .then(() => !cancelled && setStatus("ready"))
        .catch(() => !cancelled && setStatus("error"));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, page]);

  const q = query.trim();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = from + businesses.length - 1;

  function changePage(n) {
    goTo(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function directoryPath(targetPage = page) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (place.category) params.set("category", place.category);
    if (place.location) params.set("location", place.location);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/directory${params.size ? `?${params}` : ""}`;
  }

  const directoryTitle = [place.category, place.location].filter(Boolean).join(" businesses in ")
    || "Malaysia Business Directory";
  const itemList = status === "ready" && businesses.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        numberOfItems: total,
        itemListElement: businesses.map((business, index) => ({
          "@type": "ListItem",
          position: (page - 1) * pageSize + index + 1,
          url: `${SITE_ORIGIN}/business/${encodeURIComponent(business.id)}`,
          name: business.name,
        })),
      }
    : undefined;

  return (
    <>
      <Seo
        title={directoryTitle}
        description={`Browse ${directoryTitle.toLowerCase()} on ABRI and review public business details, registration evidence, and verification status.`}
        path={directoryPath()}
        noindex={Boolean(q)}
        prev={page > 1 ? directoryPath(page - 1) : undefined}
        next={page < totalPages ? directoryPath(page + 1) : undefined}
        jsonLd={itemList}
      />
      <div className="mx-auto max-w-[1200px] px-6 py-16">
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
        The verified business network
      </span>
      <h1 className="mt-3 text-[clamp(28px,3.4vw,38px)] font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
        Directory
      </h1>
      <p className="mt-2 max-w-[36rem] text-[15px] text-grey-600 dark:text-muted-foreground">
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
          className="w-full rounded-sm border border-grey-300 py-2.5 pr-3.5 pl-10 text-sm text-ink outline-none focus:border-ink dark:border-border dark:text-foreground dark:focus:border-yellow"
        />
      </div>

      <CategoryAreaFilters
        className="mt-4"
        category={place.category}
        location={place.location}
        onChange={setPlace}
      />

      {/* The pager is at the top as well as the bottom, so a reader who
          knows they want page 40 doesn't scroll past 24 cards to get there. */}
      {status === "ready" && total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13px] text-grey-500 dark:text-muted-foreground">
            {totalPages > 1
              ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} businesses`
              : `${total.toLocaleString()} ${total === 1 ? "business" : "businesses"}`}
          </div>
          <Pagination page={page} totalPages={totalPages} getHref={directoryPath} onChange={changePage} />
        </div>
      )}

      {status === "error" ? (
        <div className="mt-16 text-center text-grey-500 dark:text-muted-foreground">
          Something went wrong loading the directory. Please try again.
        </div>
      ) : businesses.length > 0 ? (
        <>
          <div className="mt-6 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((business) => (
              <div key={business.id} className="flex h-full flex-col">
                <BusinessCard business={business} />
              </div>
            ))}
          </div>
          <Pagination
            className="mt-10"
            page={page}
            totalPages={totalPages}
            getHref={directoryPath}
            onChange={changePage}
          />
          {totalPages > 1 && (
            <p className="mt-3 text-center text-[12px] text-grey-500 dark:text-muted-foreground">
              Page {page.toLocaleString()} of {totalPages.toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <div className="mt-16 text-center text-grey-500 dark:text-muted-foreground">
          {status === "loading"
            ? "Loading businesses…"
            : q
              ? `No businesses match "${query}".`
              : "No businesses match this filter."}
        </div>
      )}
      </div>
    </>
  );
}

export { Directory };
