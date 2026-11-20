import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Numbered pages, Google-style: first / previous, five page numbers around the
// current one, next / last. The five slide with the reader — on page 12 they
// are 10–14 — so any page is at most a couple of clicks away, and a page
// number is something a person can say out loud or come back to.
//
// ‹ › are ONE page, not five: that's what every pager a visitor has used means
// by an arrow, and « » cover the long jumps.
const WINDOW = 5;

function pagesAround(page, totalPages) {
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1));
  const end = Math.min(totalPages, start + WINDOW - 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function PageButton({ onClick, disabled, current, label, href, children }) {
  const className = cn(
    "flex size-9 items-center justify-center rounded-md text-[13px] font-semibold transition-colors",
    current
      ? "bg-ink text-yellow dark:bg-grey-700"
      : "text-grey-600 hover:bg-surface-2 dark:text-muted-foreground dark:hover:bg-muted",
    disabled && "pointer-events-none opacity-35",
  );

  if (href && !disabled) {
    return (
      <a
        href={href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onClick();
        }}
        aria-label={label}
        aria-current={current ? "page" : undefined}
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={className}
    >
      {children}
    </button>
  );
}

function Pagination({ page, totalPages, onChange, getHref, className }) {
  if (totalPages <= 1) return null;
  const first = page <= 1;
  const last = page >= totalPages;

  return (
    <nav aria-label="Pages" className={cn("flex items-center justify-center gap-1", className)}>
      <PageButton label="First page" disabled={first} href={getHref?.(1)} onClick={() => onChange(1)}>
        <ChevronsLeft className="size-4" />
      </PageButton>
      <PageButton label="Previous page" disabled={first} href={getHref?.(page - 1)} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="size-4" />
      </PageButton>
      {pagesAround(page, totalPages).map((n) => (
        <PageButton key={n} label={`Page ${n}`} current={n === page} href={getHref?.(n)} onClick={() => onChange(n)}>
          {n}
        </PageButton>
      ))}
      <PageButton label="Next page" disabled={last} href={getHref?.(page + 1)} onClick={() => onChange(page + 1)}>
        <ChevronRight className="size-4" />
      </PageButton>
      <PageButton label={`Last page (${totalPages})`} disabled={last} href={getHref?.(totalPages)} onClick={() => onChange(totalPages)}>
        <ChevronsRight className="size-4" />
      </PageButton>
    </nav>
  );
}

export { Pagination };
