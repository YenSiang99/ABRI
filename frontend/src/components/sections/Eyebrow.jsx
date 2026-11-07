import { EYEBROW } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// The small uppercase label above a section title, led by a short rule as in
// the homepage v2 draft. A centred label gets a rule on both sides.
function Eyebrow({ children, className, center = false }) {
  const rule = <span className="h-px w-[23px] flex-none bg-current" aria-hidden />;
  return (
    <div className={cn(EYEBROW, center && "justify-center", className)}>
      {rule}
      <span>{children}</span>
      {center && rule}
    </div>
  );
}

export { Eyebrow };
