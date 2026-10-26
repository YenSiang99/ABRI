import { EYEBROW } from "@/components/sections/marketing";
import { cn } from "@/lib/utils";

// The small uppercase label above a section title.
function Eyebrow({ children, className }) {
  return <span className={cn(EYEBROW, className)}>{children}</span>;
}

export { Eyebrow };
