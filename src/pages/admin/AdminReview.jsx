import { Link } from "react-router-dom";
import { Check, Lock } from "lucide-react";

import { useBusinesses } from "@/lib/store/businesses";
import { getAccount } from "@/lib/store/accounts";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function ClaimantLine({ business }) {
  const account = getAccount(business.claimedByAccountId);
  if (!account) return null;
  return (
    <div className="mt-2 text-[13px] text-grey-600">
      Claimed by <strong>{account.name}</strong> ({account.role}) · {account.email}
    </div>
  );
}

function claimStepState(business) {
  return business.claimStatus === "pending" ? "current" : "done";
}

function ssmStepState(business) {
  if (business.claimStatus !== "approved") return "locked";
  return business.tier === "T2" ? "done" : "current";
}

// Each step's actions live next to that step, not in a separate row, so it's
// obvious which stage an action applies to: pending steps get the primary
// approve/deny-style CTAs, done steps get a small "undo" link.
function BreadcrumbStep({ label, sublabel, status, isLast, children }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            status === "done" && "border-ink bg-ink text-white",
            status === "current" && "border-yellow bg-yellow text-yellow-ink",
            status === "locked" && "border-grey-300 bg-white text-grey-400",
          )}
        >
          {status === "done" ? (
            <Check className="size-3.5" />
          ) : status === "locked" ? (
            <Lock className="size-3" />
          ) : (
            <span className="size-1.5 rounded-full bg-yellow-ink" />
          )}
        </span>
        {!isLast && (
          <span
            className={cn("mt-1 w-[2px] flex-1", status === "done" ? "bg-ink" : "bg-grey-200")}
          />
        )}
      </div>
      <div className={cn("leading-tight", isLast ? "pb-0.5" : "pb-5")}>
        <div
          className={cn(
            "text-[13px] font-bold",
            status === "locked" ? "text-grey-400" : "text-ink",
          )}
        >
          {label}
        </div>
        <div className="text-[11.5px] text-grey-500">{sublabel}</div>
        {children}
      </div>
    </div>
  );
}

function UndoAction({ children, ...props }) {
  return (
    <button
      type="button"
      className="mt-1.5 text-[12px] font-bold text-danger hover:underline"
      {...props}
    >
      {children}
    </button>
  );
}

function ReviewTimeline({ business }) {
  const { approveClaim, removeClaim, markSsmVerified, revokeSsmVerification } = useAuth();
  const claimStatus = claimStepState(business);
  const ssmStatus = ssmStepState(business);

  function confirmRemove(message) {
    if (window.confirm(message)) removeClaim(business.id);
  }

  return (
    <div>
      <BreadcrumbStep label="Submitted" sublabel="Claim received" status="done" />

      <BreadcrumbStep
        label="Claimed"
        sublabel={claimStatus === "current" ? "Pending review" : "Approved"}
        status={claimStatus}
      >
        {claimStatus === "current" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => approveClaim(business.id)}>
              Approve claim
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                confirmRemove(
                  `Deny this claim on "${business.name}"? The claimant's account will be deleted and the listing will go back to unclaimed.`,
                )
              }
            >
              Deny claim
            </Button>
          </div>
        ) : (
          ssmStatus === "done" && (
            <UndoAction
              onClick={() =>
                confirmRemove(
                  `Remove this claim on "${business.name}"? The claimant's account will be deleted and the listing will go back to unclaimed.`,
                )
              }
            >
              Remove claim
            </UndoAction>
          )
        )}
      </BreadcrumbStep>

      <BreadcrumbStep
        label="SSM-Verified"
        sublabel={
          ssmStatus === "locked"
            ? "Waiting on claim"
            : ssmStatus === "current"
              ? "Pending SSM check"
              : "Verified"
        }
        status={ssmStatus}
        isLast
      >
        {ssmStatus === "current" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => markSsmVerified(business.id)}>
              Mark as SSM-Verified
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                confirmRemove(
                  `Reject SSM verification for "${business.name}"? This removes the claim entirely — the claimant's account will be deleted and the listing will go back to unclaimed.`,
                )
              }
            >
              Reject
            </Button>
          </div>
        )}
        {ssmStatus === "done" && (
          <UndoAction onClick={() => revokeSsmVerification(business.id)}>
            Remove SSM verification
          </UndoAction>
        )}
      </BreadcrumbStep>
    </div>
  );
}

function BusinessCard({ business }) {
  return (
    <div className="rounded-lg border border-grey-200 bg-white p-5">
      <div className="font-bold text-ink">{business.name}</div>
      <div className="mt-0.5 text-[13px] text-grey-600">
        {business.category} · {business.location}
        {business.ssm ? ` · SSM ${business.ssm}` : ""}
      </div>
      <ClaimantLine business={business} />

      <div className="mt-4 border-t border-grey-100 pt-4">
        <ReviewTimeline business={business} />
      </div>
    </div>
  );
}

function businessQueue(business) {
  if (business.claimStatus === "pending") return "pendingClaim";
  if (business.tier === "T1") return "pendingSsm";
  return "verified";
}

function QueueList({ businesses }) {
  if (businesses.length === 0) {
    return <p className="mt-10 text-sm text-grey-500">Nothing in this queue right now.</p>;
  }
  return (
    <div className="mt-6 flex flex-col gap-3">
      {businesses.map((business) => (
        <BusinessCard key={business.id} business={business} />
      ))}
    </div>
  );
}

function AdminReview() {
  const businesses = useBusinesses();
  const claimed = businesses.filter((b) => b.claimStatus !== null);

  const queues = {
    pendingClaim: claimed.filter((b) => businessQueue(b) === "pendingClaim"),
    pendingSsm: claimed.filter((b) => businessQueue(b) === "pendingSsm"),
    verified: claimed.filter((b) => businessQueue(b) === "verified"),
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase">
        Internal · not linked from any nav
      </span>
      <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink">
        Claim &amp; verification review
      </h1>
      <p className="mt-2 max-w-xl text-sm text-grey-600">
        Stands in for the blueprint's manual admin approval queue. A new
        claim needs to be approved before the claimant can log in; SSM
        verification is a separate step after that. Removing a claim reverts
        the listing to unclaimed and revokes the claimant's login.
      </p>

      {claimed.length === 0 ? (
        <p className="mt-10 text-sm text-grey-500">No claims to review yet.</p>
      ) : (
        <Tabs className="mt-8" defaultValue="pendingClaim">
          <TabsList variant="line" className="border-b border-grey-200">
            <TabsTrigger value="pendingClaim">
              Pending claim ({queues.pendingClaim.length})
            </TabsTrigger>
            <TabsTrigger value="pendingSsm">
              Pending SSM ({queues.pendingSsm.length})
            </TabsTrigger>
            <TabsTrigger value="verified">Verified ({queues.verified.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pendingClaim">
            <QueueList businesses={queues.pendingClaim} />
          </TabsContent>
          <TabsContent value="pendingSsm">
            <QueueList businesses={queues.pendingSsm} />
          </TabsContent>
          <TabsContent value="verified">
            <QueueList businesses={queues.verified} />
          </TabsContent>
        </Tabs>
      )}

      <Link to="/" className="mt-10 inline-block text-sm font-bold text-ink hover:underline">
        ← Back to site
      </Link>
    </div>
  );
}

export { AdminReview };
