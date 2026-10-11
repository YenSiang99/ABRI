import { Fragment, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, ChevronRight, Lock, Search } from "lucide-react";

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
import { FoundingSettings } from "@/pages/admin/FoundingSettings";

// The claimant's SSM number beside what the public registers say about this
// listing (GET /admin/claims, registerCheck). Most listings have no register
// number, so "nothing to compare" is the usual case and says so; a number
// the registers file under a DIFFERENT business is the one to stop at.
function RegisterCheck({ account }) {
  const check = account.registerCheck;
  return (
    <div className="text-[13px] text-muted-foreground">
      <div>
        Claimant's SSM:{" "}
        <strong className="font-mono text-foreground">{account.claimSsm || "none given"}</strong>
        {check?.match === true && <span className="ml-2 text-emerald-600 dark:text-emerald-400">✓ matches the register</span>}
        {check?.match === false && <span className="ml-2 text-red-600 dark:text-red-400">✗ doesn't match the register</span>}
      </div>
      {check?.listed?.length > 0 ? (
        <div className="mt-0.5">
          Registers list:{" "}
          {check.listed.map((r) => `${r.ssm} (${r.source})`).join(", ")}
        </div>
      ) : (
        <div className="mt-0.5">No register number for this listing — check it on SSM e-Info.</div>
      )}
      {check?.elsewhere?.length > 0 && (
        <div className="mt-0.5 text-red-600 dark:text-red-400">
          ⚠ The registers file this number under {check.elsewhere.map((e) => `${e.name} (${e.source})`).join(", ")}.
        </div>
      )}
    </div>
  );
}

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
  // A sale rather than a hand grant: a paid year that starts at SSM
  // verification (backend POST /admin/businesses/:id/membership-tier).
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty =
    paid ||
    membershipTier !== business.membershipTier ||
    expiresAt !== dateInputValue(business.membershipTierExpiresAt);

  async function handleSave() {
    setSaving(true);
    await onSetMembershipTier(business.id, { membershipTier, expiresAt, paid });
    setPaid(false);
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
        {!paid && (
          <input
            type="date"
            aria-label="Membership expiry date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={fieldClass}
          />
        )}
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={paid}
            disabled={membershipTier === "free"}
            onChange={(e) => setPaid(e.target.checked)}
          />
          Paid — a year from SSM verification
        </label>
        <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "Saving…" : paid ? "Record payment" : "Save tier"}
        </Button>
      </div>
      {business.pendingMembershipTier && (
        <p className="mt-1.5 text-[11.5px] text-amber-700 dark:text-amber-400">
          Paid for {membershipTierLabel[business.pendingMembershipTier] ?? business.pendingMembershipTier}
          {" "}— starts when SSM is verified. Refund it if verification fails.
        </p>
      )}
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        {business.membershipTierGrant === "founding"
          ? "On Founding Pro — its end date is set in the Founding programme panel above."
          : "An expiry date is enforced: the tier drops to Free when it passes. Leave it empty for no end."}
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
            {/* One review (ABRI-launch-access-plan.md step 3): with an SSM
                number on the claim, approving it says the number checked out
                too, and the business lands on SSM-Verified. A number that
                doesn't check out is a reason to deny the claim. */}
            <Button size="sm" onClick={() => onApprove(account.id)}>
              {account.claimSsm ? "Approve claim + SSM" : "Approve claim"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                confirmRemove(
                  `Deny this claim on "${business.name}"? The claimant keeps their account and can claim again; they'll get an email saying it wasn't approved.`,
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

function claimQueue(account, business) {
  if (account.claimStatus === "pending") return "pendingClaim";
  if (!business) return null;
  if (business.verificationLevel === CLAIMED) return "pendingSsm";
  if (business.verificationLevel === SSM_VERIFIED) return "verified";
  return null;
}

const STAGE_LABEL = {
  pendingClaim: "Claim pending",
  pendingSsm: "SSM pending",
  verified: "Verified",
};

function StagePill({ stage }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold",
        stage === "verified"
          ? "border-foreground bg-foreground text-background"
          : "border-yellow bg-yellow/15 text-foreground",
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

function submittedOn(iso) {
  return iso
    ? new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

// A table, one row per claim, because a queue is scanned before it is worked:
// the admin wants to see forty claims at a glance and open the one they're
// acting on, not scroll past forty timelines to reach it. Clicking a row opens
// the same step-by-step timeline the cards used to show, with each step's
// approve/deny next to it — the actions didn't move, only the default view.
function ClaimTable({ claims, onApprove, onRemove, onVerifySsm, onRevokeSsm, onSetMembershipTier }) {
  const [open, setOpen] = useState(() => new Set());

  if (claims.length === 0) {
    return <p className="mt-10 text-sm text-muted-foreground">Nothing in this queue right now.</p>;
  }

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const th = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-8" aria-label="Expand" />
            <th className={th}>Business</th>
            <th className={cn(th, "hidden md:table-cell")}>Claimant</th>
            <th className={cn(th, "hidden sm:table-cell")}>Submitted</th>
            <th className={th}>Stage</th>
            <th className={cn(th, "hidden md:table-cell")}>Tier</th>
          </tr>
        </thead>
        <tbody>
          {claims.map(({ account, business }) => {
            const isOpen = open.has(account.id);
            return (
              <Fragment key={account.id}>
                <tr
                  onClick={() => toggle(account.id)}
                  className="cursor-pointer border-t border-border hover:bg-muted/40"
                >
                  <td className="px-3 py-3 align-top">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? `Collapse ${business.name}` : `Expand ${business.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(account.id);
                      }}
                      className="text-muted-foreground"
                    >
                      <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                    </button>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-bold text-foreground">{business.name}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {[business.category, business.location].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 align-top md:table-cell">
                    <div className="text-foreground">{account.name}</div>
                    <div className="text-[12px] text-muted-foreground">{account.email}</div>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 align-top text-muted-foreground sm:table-cell">
                    {submittedOn(account.createdAt)}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StagePill stage={claimQueue(account, business)} />
                  </td>
                  <td className="hidden px-3 py-3 align-top text-muted-foreground md:table-cell">
                    {account.claimStatus === "approved"
                      ? membershipTierLabel[business.membershipTier] ?? business.membershipTier
                      : "—"}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-dashed border-border bg-muted/20">
                    <td />
                    <td colSpan={5} className="px-3 pt-3 pb-5">
                      {account.claimStatus === "pending" ? (
                        <RegisterCheck account={account} />
                      ) : (
                        <div className="text-[13px] text-muted-foreground">
                          {business.ssm ? `SSM ${business.ssm}` : "No SSM number submitted"}
                        </div>
                      )}
                      <ClaimantLine account={account} />
                      <div className="mt-4">
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
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdminReview() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [query, setQuery] = useState("");

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

  const allClaims = accounts
    .filter((account) => account.business)
    .map((account) => ({ account, business: account.business }));
  // Narrows every tab at once, so the counts on the tabs answer "how many
  // match" while a search is typed.
  const q = query.trim().toLowerCase();
  const claims = q
    ? allClaims.filter(({ account, business }) =>
        [business.name, business.ssm, account.name, account.email].some((v) =>
          String(v ?? "").toLowerCase().includes(q),
        ),
      )
    : allClaims;

  const queues = {
    pendingClaim: claims.filter((c) => claimQueue(c.account, c.business) === "pendingClaim"),
    pendingSsm: claims.filter((c) => claimQueue(c.account, c.business) === "pendingSsm"),
    verified: claims.filter((c) => claimQueue(c.account, c.business) === "verified"),
  };

  const queueProps = { onApprove, onRemove, onVerifySsm, onRevokeSsm, onSetMembershipTier };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground">
        Claim &amp; verification review
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Claimants can log in while they wait, but own nothing until approved. One review covers
        the claim and its SSM number: approving lands the business on SSM-Verified, and a number
        that doesn't check out is a reason to deny. Claims approved by an email code arrive in the
        SSM queue instead. Removing an approved claim reverts the listing to unclaimed.
      </p>
      <FoundingSettings />
      {allClaims.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No claims to review yet.</p>
      ) : (
        <>
          <div className="relative mt-8 max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search business, SSM, claimant or email"
              className="w-full rounded-md border border-border bg-card py-2 pr-3 pl-9 text-[13px] text-foreground outline-none focus:border-ring"
            />
          </div>
          <Tabs className="mt-4" defaultValue="pendingClaim">
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
              <ClaimTable claims={queues.pendingClaim} {...queueProps} />
            </TabsContent>
            <TabsContent value="pendingSsm">
              <ClaimTable claims={queues.pendingSsm} {...queueProps} />
            </TabsContent>
            <TabsContent value="verified">
              <ClaimTable claims={queues.verified} {...queueProps} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

export { AdminReview };
