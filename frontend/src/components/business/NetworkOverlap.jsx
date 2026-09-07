import { Link } from "react-router-dom";
import { Users } from "lucide-react";

// "2 of the businesses vouching for them are in your network."
//
// The Plus line, and the most persuasive sentence either search screen can
// say. A verification badge reports that a document was checked; this reports
// that somebody the reader already trusts has staked their own reputation.
// Those are different kinds of evidence, and only one of them gets acted on.
//
// Renders NOTHING when the key is absent — which is both "the viewer is below
// Plus" and "there is no overlap". Deliberately the same silence: a Free
// member is sold the feature by the LockedFeature panel on the page, not by a
// teasing stub on every card, and a Plus member with no shared contacts
// should not be shown an empty box on every result they open.
//
// Never a blurred or redacted version. ABRI-feature-checklist.md line 53 is
// explicit — "a blurred number implies a real number is behind it" — and here
// there often isn't one.
function NetworkOverlap({ vouchers, basePath = "/business" }) {
  if (!vouchers || vouchers.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        {vouchers.length === 1 ? "Someone you know vouches for them" : "People you know vouch for them"}
      </div>
      {/* Names, not a count. "2 of them are in your network" is interesting;
          "Tan & Co vouches for them" is what makes somebody pick up the
          phone — and the name is checkable, which a number is not. */}
      <p className="mt-1.5 text-sm text-foreground">
        {vouchers.map((b, i) => (
          <span key={b.id}>
            {i > 0 && (i === vouchers.length - 1 ? " and " : ", ")}
            <Link
              to={`${basePath}/${b.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {b.name}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}

export { NetworkOverlap };
