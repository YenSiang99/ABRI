import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, Lock } from "lucide-react";

import {
  fetchAdminClaims,
  approveAdminClaim,
  rejectAdminClaim,
  revokeAdminClaim,
  verifySsm,
  revokeSsm,
  setBusinessMembershipTier,
} from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";
import { MEMBERSHIP_TIER_ORDER, membershipTierLabel } from "@/lib/membershipTiers";
import { CLAIMED, SSM_VERIFIED } from "@/lib/verificationLevels";

function ClaimantLine({ account }) {
  return (
    <div className="mt-2 text-[13px] text-muted-foreground">
      Claimed by <strong>{account.name}</strong> ({account.role}) · {account.email}
      {account.verificationMethod === "domain-auto" && (
        <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          Domain-verified
        </span>
      )}
    </div>
  );
}

function claimStepState(account) {
  return account.claimStatus === "pending" ? "current" : "done";
}

function ssmStepState(account, business) {
  if (account.claimStatus !== "approved") return "locked";
  return business.verificationLevel === SSM_VERIFIED ? "done" : "current";
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
            status === "done" && "border-foreground bg-foreground text-background",
            status === "current" && "border-yellow bg-yellow text-yellow-ink",
            status === "locked" && "border-border bg-card text-muted-foreground",
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
            className={cn("mt-1 w-[2px] flex-1", status === "done" ? "bg-foreground" : "bg-border")}
          />
        )}
      </div>
      <div className={cn("leading-tight", isLast ? "pb-0.5" : "pb-5")}>
        <div
          className={cn(
            "text-[13px] font-bold",
            status === "locked" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {label}
        </div>
        <div className="text-[11.5px] text-muted-foreground">{sublabel}</div>
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

function membershipTierStepState(account) {
  // An unclaimed listing has nobody to bill, so the step stays shut until
  // the claim is approved. Every claimed business has a membership tier (schema
  // default "free"), which is why there is no "current" state here.
  return account.claimStatus === "approved" ? "done" : "locked";
}

// Date inputs want YYYY-MM-DD; membershipTierExpiresAt arrives as a full ISO string.
function dateInputValue(iso) {
  return iso ? String(iso).slice(0, 10) : "";
}

// Remounted by its key in ReviewTimeline whenever the saved tier changes,
// which is what resets these two fields after a save — cheaper and harder
// to get wrong than syncing local state back to props in an effect.
function MembershipTierFields({ business, onSetMembershipTier }) {
  const [membershipTier, setMembershipTier] = useState(business.membershipTier);
  const [expiresAt, setExpiresAt] = useState(dateInputValue(business.membershipTierExpiresAt));
  const [saving, setSaving] = useState(false);

  const dirty =
    membershipTier !== business.membershipTier ||
    expiresAt !== dateInputValue(business.membershipTierExpiresAt);

  async function handleSave() {
    setSaving(true);
    await onSetMembershipTier(business.id, { membershipTier, expiresAt });
    setSaving(false);
  }

  const fieldClass =
    "rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground";

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Membership tier"
          value={membershipTier}
          onChange={(e) => setMembershipTier(e.target.value)}
          className={fieldClass}
        >
          {MEMBERSHIP_TIER_ORDER.map((value) => (
            <option key={value} value={value}>
              {membershipTierLabel[value]}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Membership expiry date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className={fieldClass}
        />
        <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save tier"}
        </Button>
      </div>
      {/* Said out loud because the field looks like it does something it
          doesn't: no code reads membershipTierExpiresAt yet, so a date that has
          passed leaves the business on its tier. */}
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        The expiry date is recorded only — nothing downgrades automatically yet.
      </p>
    </div>
  );
}

function ReviewTimeline({
  account,
  business,
  onApprove,
  onRemove,
  onVerifySsm,
  onRevokeSsm,
  onSetMembershipTier,
}) {
  const claimStatus = claimStepState(account);
  const ssmStatus = ssmStepState(account, business);
  const membershipTierStatus = membershipTierStepState(account);

  function confirmRemove(message) {
    if (window.confirm(message)) onRemove(account);
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
            <Button size="sm" onClick={() => onApprove(account.id)}>
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
          <UndoAction
            onClick={() =>
              confirmRemove(
                `Remove this claim on "${business.name}"? The claimant's account will be deleted and the listing will go back to unclaimed.`,
              )
            }
          >
            Remove claim
          </UndoAction>
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
      >
        {ssmStatus === "current" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => onVerifySsm(business.id)}>
              Mark as SSM-Verified
            </Button>
          </div>
        )}
        {ssmStatus === "done" && (
          <UndoAction onClick={() => onRevokeSsm(business.id)}>
            Remove SSM verification
          </UndoAction>
        )}
      </BreadcrumbStep>

      {/* Billing, not a trust step — but it belongs on this timeline
          because this is the screen an admin is already on when they act
          on a business, and there is no payment page to fulfil a sale
          anywhere else. */}
      <BreadcrumbStep
        label="Membership"
        sublabel={
          membershipTierStatus === "locked"
            ? "Waiting on claim"
            : `${membershipTierLabel[business.membershipTier] ?? business.membershipTier}${
                business.isFoundingMember ? " · founding member" : ""
              }${
                business.membershipTierExpiresAt
                  ? ` · until ${dateInputValue(business.membershipTierExpiresAt)}`
                  : ""
              }`
        }
        status={membershipTierStatus}
        isLast
      >
        {membershipTierStatus === "done" && (
          <MembershipTierFields
            key={`${business.membershipTier}:${business.membershipTierExpiresAt ?? ""}`}
            business={business}
            onSetMembershipTier={onSetMembershipTier}
          />
        )}
      </BreadcrumbStep>
    </div>
  );
}

function ClaimCard({ account, business, onApprove, onRemove, onVerifySsm, onRevokeSsm, onSetMembershipTier }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="font-bold text-foreground">{business.name}</div>
      <div className="mt-0.5 text-[13px] text-muted-foreground">
        {business.category} · {business.location}
        {business.ssm ? ` · SSM ${business.ssm}` : ""}
      </div>
      <ClaimantLine account={account} />

      <div className="mt-4 border-t border-border pt-4">
        <ReviewTimeline
          account={account}
          business={business}
          onApprove={onApprove}
          onRemove={onRemove}
          onVerifySsm={onVerifySsm}
          onRevokeSsm={onRevokeSsm}
          onSetMembershipTier={onSetMembershipTier}
        />
      </div>
    </div>
  );
}

function claimQueue(account, business) {
  if (account.claimStatus === "pending") return "pendingClaim";
  if (!business) return null;
  if (business.verificationLevel === CLAIMED) return "pendingSsm";
  if (business.verificationLevel === SSM_VERIFIED) return "verified";
  return null;
}

function QueueList({ claims, onApprove, onRemove, onVerifySsm, onRevokeSsm, onSetMembershipTier }) {
  if (claims.length === 0) {
    return <p className="mt-10 text-sm text-muted-foreground">Nothing in this queue right now.</p>;
  }
  return (
    <div className="mt-6 flex flex-col gap-3">
      {claims.map(({ account, business }) => (
        <ClaimCard
          key={account.id}
          account={account}
          business={business}
          onApprove={onApprove}
          onRemove={onRemove}
          onVerifySsm={onVerifySsm}
          onRevokeSsm={onRevokeSsm}
          onSetMembershipTier={onSetMembershipTier}
        />
      ))}
    </div>
  );
}

function AdminReview() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);

  // GET /admin/claims embeds the raw Business row, billing columns and all.
  // This page used to pair each claim with a row from GET /businesses
  // instead, which runs every row through omitBillingFields — so
  // membershipTier never arrived and the tier step had nothing to show.
  // Nothing here reads vouchCount or vouchLevel, the only fields that endpoint
  // added, so the second request is gone rather than merged.
  function loadData() {
    return fetchAdminClaims()
      .then(setAccounts)
      .catch((err) => {
        toast.error(err.message);
        throw err;
      })
      .finally(() => setLoading(false));
  }

  // Guarded on isAdmin, not just on the early return below: hooks run before
  // that return, so a non-admin who somehow lands here (a stale `from` after
  // an admin signed out used to do it) would fire GET /admin/claims and be
  // toasted "Admin access required." on the way out.
  useEffect(() => {
    if (!isAdmin) return;
    loadData().catch(() => {});
  }, [isAdmin]);

  // ProtectedRoute + AppLayout already keep non-admins out of /app/admin;
  // this is a fallback in case that ever changes underneath this page.
  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-6 py-12 text-sm text-muted-foreground">Loading…</div>;
  }

  async function withRefresh(action) {
    try {
      await action();
    } catch (err) {
      toast.error(err.message);
      return;
    }
    await loadData().catch(() => {});
  }

  const onApprove = (accountId) => withRefresh(() => approveAdminClaim(accountId));
  const onRemove = (account) =>
    withRefresh(() =>
      account.claimStatus === "pending" ? rejectAdminClaim(account.id) : revokeAdminClaim(account.id),
    );
  const onVerifySsm = (businessId) => withRefresh(() => verifySsm(businessId));
  const onRevokeSsm = (businessId) => withRefresh(() => revokeSsm(businessId));
  const onSetMembershipTier = (businessId, fields) =>
    withRefresh(() => setBusinessMembershipTier(businessId, fields));

  const claims = accounts
    .filter((account) => account.business)
    .map((account) => ({ account, business: account.business }));

  const queues = {
    pendingClaim: claims.filter((c) => claimQueue(c.account, c.business) === "pendingClaim"),
    pendingSsm: claims.filter((c) => claimQueue(c.account, c.business) === "pendingSsm"),
    verified: claims.filter((c) => claimQueue(c.account, c.business) === "verified"),
  };

  const queueProps = { onApprove, onRemove, onVerifySsm, onRevokeSsm, onSetMembershipTier };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground">
        Claim &amp; verification review
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        A new claim needs to be approved before the claimant can log in; SSM verification is a
        separate step after that. Removing a claim reverts the listing to unclaimed and revokes
        the claimant's login.
      </p>
      {claims.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No claims to review yet.</p>
      ) : (
        <Tabs className="mt-8" defaultValue="pendingClaim">
          <TabsList variant="line" className="border-b border-border">
            <TabsTrigger value="pendingClaim">
              Pending claim ({queues.pendingClaim.length})
            </TabsTrigger>
            <TabsTrigger value="pendingSsm">
              Pending SSM ({queues.pendingSsm.length})
            </TabsTrigger>
            <TabsTrigger value="verified">Verified ({queues.verified.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pendingClaim">
            <QueueList claims={queues.pendingClaim} {...queueProps} />
          </TabsContent>
          <TabsContent value="pendingSsm">
            <QueueList claims={queues.pendingSsm} {...queueProps} />
          </TabsContent>
          <TabsContent value="verified">
            <QueueList claims={queues.verified} {...queueProps} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export { AdminReview };
