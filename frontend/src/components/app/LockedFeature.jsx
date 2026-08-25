import { Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { planLabel } from "@/lib/plans";

// One panel for both reasons a feature can be shut: verification isn't
// finished, or the business isn't on a plan that includes it.
//
// `requiredPlan` is opt-in rather than derived from the feature, because
// the same lock is worth selling against in one place and not in another.
// A visitor reading someone else's profile is the wrong person to pitch an
// upgrade to (see the comment at the vouches tab in BusinessProfile.jsx);
// the owner looking at their own profile is exactly the right one. Passing
// it adds the plan chip and the link to pricing; leaving it off renders
// the panel exactly as it did before the prop existed.
function LockedFeature({ title, description, requiredPlan }) {
  const plan = requiredPlan ? planLabel[requiredPlan] : null;

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {plan && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {/* Same squared mono chip the sidebar uses for the member's own
              plan, for the same reason: it has to read as billing, not as
              a third trust signal beside the verification tier and the
              vouch ladder. See schema.prisma's membershipPlan comment. */}
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Included in {plan}
          </span>
          <Link
            to="/#pricing"
            className="text-sm font-semibold text-foreground underline underline-offset-4"
          >
            See plans →
          </Link>
        </div>
      )}
    </div>
  );
}

export { LockedFeature };
