import { useEffect, useState } from "react";
import { ShieldCheck, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchSsmReviews, verifySsm, rejectSsm } from "@/lib/api/admin";
import { toast } from "@/lib/toast";

// The SSM review queue — the admin half of the flow
// ABRI-feature-checklist.md §2 records as missing ("there's no way to submit
// and no admin queue"). Until this existed, L2 was a badge an admin flipped by
// hand with no number behind it.
//
// WHAT THIS QUEUE IS, precisely: businesses where `ssm` is set and the level
// is still L1. That pair is the pending state — there is no status column, so
// this screen and the member's own Verification page read the same two fields
// and cannot disagree about who is waiting. Approving moves the level;
// rejecting clears the number. Either way the row leaves by the same rule that
// put it here.
//
// NO NOTE FIELD, unlike the vouch and ask queues. Those write their note onto
// a Flag row that exists to hold it; there is no equivalent row here, and
// ActivityEvent has no detail column, so a reason typed here would be
// collected and then discarded before reaching the member. Asking for input
// that goes nowhere is worse than not asking — see the route's comment for the
// change that would fix it properly.

function Row({ business, onDecided }) {
  const [busy, setBusy] = useState(null);
  const contact = business.accounts?.[0];

  async function decide(action) {
    setBusy(action);
    try {
      if (action === "approve") {
        await verifySsm(business.id);
        toast.success(`${business.name} is now SSM-Verified`);
      } else {
        await rejectSsm(business.id);
        toast(`${business.name}'s number was turned down`, {
          description: "They can submit a corrected one straight away.",
        });
      }
      await onDecided();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{business.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {business.category} · {business.location}
          </p>

          {/* The number AS SUBMITTED, in mono, unmodified. The admin is
              comparing this character by character against the register, so
              the stored raw value is the one that must be shown — never the
              normalized lookup key, which strips the punctuation that tells
              the two SSM formats apart. */}
          <p className="mt-3 font-mono text-sm font-medium text-foreground">{business.ssm}</p>

          <p className="mt-2 text-xs text-muted-foreground">
            Submitted {new Date(business.updatedAt).toLocaleString()}
            {contact && ` · ${contact.name} (${contact.role}) · ${contact.email}`}
          </p>

          {/* Whatever else we hold that an admin can check the name against.
              Not evidence, just the other things on file. */}
          {(business.domain || business.website) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {business.domain && <>Domain {business.domain}</>}
              {business.domain && business.website && " · "}
              {business.website && (
                <a
                  href={business.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {business.website} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button size="sm" disabled={Boolean(busy)} onClick={() => decide("approve")}>
            {busy === "approve" ? "Verifying…" : "Verify"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => decide("reject")}
          >
            {busy === "reject" ? "Clearing…" : "Turn down"}
          </Button>
        </div>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Verifying moves them to SSM-Verified, tells them, and announces it on the network feed.
        Turning it down clears the number so they can submit a corrected one — nobody but them is
        told.
      </p>
    </li>
  );
}

function AdminSsmReviews() {
  const [businesses, setBusinesses] = useState([]);
  const [status, setStatus] = useState("loading");

  async function load() {
    try {
      setBusinesses(await fetchSsmReviews());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Admin
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">SSM review</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Claimed businesses that have submitted a registration number. Check each one against the
        SSM register before verifying — this badge is the one thing on ABRI money cannot buy.
      </p>

      {status === "loading" && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
      {status === "error" && (
        <p className="mt-8 text-sm text-muted-foreground">Couldn&rsquo;t load the queue.</p>
      )}

      {status === "ready" && businesses.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing waiting. Numbers appear here as members submit them.
          </p>
        </div>
      )}

      {status === "ready" && businesses.length > 0 && (
        <ul className="mt-8 space-y-4">
          {businesses.map((business) => (
            <Row key={business.id} business={business} onDecided={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

export { AdminSsmReviews };
