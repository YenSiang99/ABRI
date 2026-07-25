# Business claim verification — how it works

When someone claims a business listing at `/register`, ABRI needs to decide whether they're
actually affiliated with that business before granting login access. This happens one of two
ways, decided automatically by `matchesBusinessDomain()` in `src/lib/domainVerification.js`.

Both paths converge on the same final action — click a confirmation link, get signed in — so
that neither the copy nor the button labels on the Verify step reveal which path a given
claimant is on. See "Why the copy is identical" below for the reasoning.

## Path A — claimant's email is on the business's registered domain (auto-verified)

**Trigger** (`matchesBusinessDomain(email, business)` returns `true`):
- The business record has a non-null `domain` field. This is seed/import data set in
  `src/data/businesses.js` and carried through `src/lib/store/businesses.js` — it is never
  writable by the claimant, so it can't be gamed by typing in an arbitrary company name.
- That domain is not on the public-provider blocklist (`PUBLIC_EMAIL_DOMAINS` in
  `domainVerification.js` — gmail.com, outlook.com, yahoo.com, icloud.com, etc.).
- The claimant's email domain (the substring after `@`) matches it exactly.

**Flow:**
1. Claimant goes through the claim wizard (`src/pages/Register.jsx`) — Search/Details → Personal
   info — as normal.
2. On the **Verify** step, the claimant enters their phone code and clicks **"Continue."**
   Nothing is written to the account/business stores yet — `createVerificationToken()`
   (`src/lib/store/emailVerifications.js`) mints a token holding the full claim payload (business
   id, name, email, password, etc.), which stands in for "sending" a verification email
   immediately. Token expires after 15 minutes.
3. Because the confirmation link is available right away, the UI reveals a "simulated email"
   panel with a clickable **"Open verification link"** in the same step — standing in for the
   claimant opening their inbox and clicking a link that, in a real system, would have arrived
   the instant the domain match was determined.
4. Clicking it navigates to `/verify-claim/:token` (`src/pages/VerifyClaimLink.jsx`), which:
   - Consumes the token (`consumeToken()` — single use, checked against expiry).
   - Creates the account + business claim (`claimOrRegister`, same call used by Path B).
   - Immediately auto-approves the claim (`businessStore.autoApproveClaim`), tagging it
     `verificationMethod: "domain-auto"`.
   - Marks the account's email verified and signs the claimant straight into their dashboard
     (`completeDomainVerifiedClaim` in `src/context/AuthContext.jsx`).
5. The claim never enters the admin's "Pending claim" queue
   (`src/pages/admin/AdminReview.jsx`). It shows up directly under "Pending SSM" (SSM
   verification is a separate, later step) with a **"Domain-verified"** badge next to the
   claimant's name — visible only to admins, for audit purposes.

## Path B — no domain match (manual admin review)

**Trigger** — any of:
- The business has no `domain` on file at all. This is always true for businesses registered via
  "Register it manually" in the wizard, since there's no existing record to pull a domain from.
- The business does have a `domain`, but the claimant's email is on a different one.
- The claimant's email domain is a known public provider (Gmail, Outlook, Yahoo, etc.) — this can
  never auto-match, even defensively if a business's `domain` field were ever set to one.

**Flow:**
1. Same wizard. On the Verify step, the claimant enters their phone code and clicks
   **"Continue"** — identical action and label to Path A. No link is generated or shown yet.
2. `claimOrRegister` creates the account and business claim immediately, with
   `claimStatus: "pending"` and `emailVerified: false`. The claimant is **not** logged in —
   `AuthContext.login()` refuses any account whose business still has `claimStatus === "pending"`
   or whose email isn't verified yet.
3. The claimant lands on a "Claim submitted" screen with a **"Check claim status"** link to
   `/claim-status?email=...` — since they have no session, this is their only way back.
4. An admin opens `/admin` and clicks "Approve claim." This is the moment a confirmation token
   finally gets minted (`createVerificationToken` called from `AuthContext.approveClaim`, with a
   7-day TTL rather than 15 minutes, since the claimant may not check back immediately).
5. The claimant revisits `/claim-status` (`src/pages/ClaimStatus.jsx`), enters their email, and:
   - Before approval: sees a generic "still verifying" message, no link.
   - After approval: sees the same "simulated email" panel and "Open verification link" as Path
     A would have shown immediately.
6. Clicking it hits the same `/verify-claim/:token` page, which this time takes the
   already-exists/already-approved branch — `completeManualVerifiedClaim` in `AuthContext.jsx`
   just marks the account's email verified and signs them in.

## Why the copy is identical

Earlier drafts had the Verify step explicitly say "no admin review needed" on the domain-match
path and "we'll manually cross-check" on the fallback path. That let anyone testing different
emails against the same business's claim form learn, from the wording alone, which domains ABRI
already has on file for that business — an information leak about the verification mechanism
itself, not just a UX detail.

The fix: both paths now show the same intro text and the same button label ("Continue") on the
Verify step, and the underlying mechanism (domain match vs. admin review) is never named in
either. The one difference that's genuinely unavoidable — Path A's confirmation link is available
immediately, Path B's isn't until an admin acts — still exists, since hiding that would be
actively misleading to a legitimate claimant. But an outside prober no longer gets a plain-text
answer; they'd have to infer it purely from timing, and only by actually running the flow twice
against the same business email — a much higher bar than reading a sentence.

## Key files
- `src/lib/domainVerification.js` — domain-matching + public-provider blocklist logic.
- `src/lib/store/emailVerifications.js` — token store (both immediate and delayed shapes).
- `src/lib/store/businesses.js` — `domain` field, `verificationMethod` tag, `autoApproveClaim`.
- `src/lib/store/accounts.js` — `emailVerified` flag, `setEmailVerified`.
- `src/context/AuthContext.jsx` — `approveClaim` (mints the delayed token), `completeDomainVerifiedClaim`,
  `completeManualVerifiedClaim`.
- `src/pages/Register.jsx` — claim wizard, unified Verify step copy.
- `src/pages/VerifyClaimLink.jsx` — `/verify-claim/:token`, branches on token shape.
- `src/pages/ClaimStatus.jsx` — `/claim-status`, session-less lookup for Path B claimants.
- `src/pages/admin/AdminReview.jsx` — manual approval queue; shows the "Domain-verified" badge.

## Still open (deferred, not addressed here)
An already-departed employee (or anyone else who still controls an inbox on the business's
domain) can currently auto-claim the business via Path A — domain match alone is trusted with no
further check against who currently represents the company. Flagged during planning as a known
risk, explicitly deferred rather than solved in this pass.
