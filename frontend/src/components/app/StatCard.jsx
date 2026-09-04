import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

// `to` is optional. When present the whole card becomes a link, using the same
// hover wash the Dashboard's work prompts use — so a member who doesn't know
// what "SSM-Verified" or "First Vouch" means can press the thing that confused
// them and land on the page that explains it.
//
// Optional rather than required because most stat cards are terminal facts
// ("Profile views") with nowhere useful to go. All seven existing call sites
// pass nothing and are unaffected.
function StatCard({ label, value, hint, icon: Icon, to }) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  );

  const className = cn(
    "block rounded-2xl border border-border bg-card p-5",
    to && "transition-colors hover:bg-secondary",
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}

export { StatCard };
