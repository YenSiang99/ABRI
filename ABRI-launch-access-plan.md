# Launch access — build plan

The work list from the 11 Oct 2026 decisions on who can do what at signup and launch. **Update the status line of each step as it lands**, so the next session knows where to pick up.

## The rules (decided 11 Oct 2026)

| Stage | How they get there | What they can do |
|---|---|---|
| Signed up, claim pending | Confirm their own email | Log in; browse, search, see their claim status. Acts as **no business** everywhere. |
| Claimed (L1) | Code sent to the business's email on file (instant), **or** one admin review | Edit their page, connect, follow, log work, plus their plan's features |
| SSM-Verified (L2) | The same single admin review (SSM number asked at claim). Email-code claimants submit SSM afterwards. | Give and receive vouches |
| Founding | Approved before launch (no cap) | **Pro** until one end date (an editable setting); then Free, the badge forever, and a lasting founding discount |
| Paid Plus/Pro | Pay any time after claiming | Non-SSM features at once; the 12 months start the day SSM passes; refund if it fails |

A wrong SSM number: on the email-code path they stay L1 and can resubmit (revoke if it's someone else's number). On the admin path the claim is rejected, but the account stays and they can claim again.

"Verification cannot be bought" still holds: Founding and paid plans never move a verification level.

## Steps

### 1. Pending claimants can log in — **done 11 Oct** (tests: `backend/tests/claims.mjs`; checked in the browser)
- Claim (admin path) emails a confirm link straight away; clicking it logs them in.
- `requireAuth`/`optionalAuth` hide `businessId` unless `claimStatus === "approved"`, so every route treats a pending claimant as having no business. Only `/auth/me` reads the claim.
- `/auth/me` returns `claim: { status, business (public view) }` for pending/rejected, never the owner view.
- Deferred connections are consumed only once approved.
- Rejecting a claim (or losing to a rival) keeps the account: `claimStatus "rejected"`, `businessId` cleared. They can claim again while logged in (`POST /businesses/me/claim`).
- Approval emails a "you're approved" notice (no token needed if the email is already confirmed).
- Frontend: business-less accounts get a limited app (claim status home, directory, profiles); every other `/app` page redirects home.
- Also fixed: link tokens came back in API responses even with a mail provider set, so "we emailed you a link" proved nothing. Now `devOnlyToken()` (lib/mailer.js) returns them only when no provider is set up (local dev, tests).
- Files: middleware/auth.js, lib/accountView.js (claimView), lib/businessClaim.js (rivals rejected, emailRejectedClaimant), routes/admin.js, routes/businesses.js (POST /me/claim), routes/auth.js, lib/connections.js; frontend AuthContext (claim, claimAsMember), pages/app/ClaimHome.jsx, AppLayout (CLAIMANT_PATHS), AppSidebar (claimant variant), Register (logged-in redirect, check-your-email screen), AppDirectory.
- The ClaimHome copy promises phone/email on every listing; that becomes true with step 5.

### 2. Instant claim by a code to the email on file — **done 11 Oct** (tests in `claims.mjs` §6; checked in the browser)
- `POST /businesses/me/claim/email-code` sends a 6-digit code to the listing's `email`, shown masked (`i***@company.my`); `.../verify` approves the claim at L1 (`verificationMethod "email-code"`).
- Rate limits: a few sends per claim per hour; codes expire (15 min) and allow a few attempts.
- Fallback stays the admin queue.
- Built as: `ClaimCode` table (migration 20261011090000_add_claim_codes; hash only, `sentTo` pinned), lib/claimCode.js (3 sends/claimant/hour, 5/listing/day, 5 attempts, 15 min, HTML-escaped email to the listing), routes `POST /businesses/me/claim/email-code` and `.../verify`, `claim.codeEmail` (masked) in /auth/me, and the "Skip the wait" card on ClaimHome.
- Only offered on unclaimed listings from a source. A business the claimant typed in has no independent email.
- **Dev/prod need the migration** (the deploy applies it). abri_test and local `abri` already have it.

### 3. One combined claim + SSM review — **done 11 Oct** (tests in `claims.mjs` §1, §4, §6; admin screen checked in the browser)
- SSM number required on the admin path; it is written to `Business.ssm` only for the approved claimant (rivals must not clobber it).
- The admin approve action lands the business on L2 directly when the number checks out, or rejects the claim.
- The review screen shows the register's SSM number(s) from `SourceRecord` beside the claimant's: match ✓ / mismatch ✗.
- Email-code claimants submit SSM through the existing `POST /businesses/me/ssm` queue.
- Built as: `Account.claimSsm` (migration 20261011100000_account_claim_ssm), required on `POST /businesses/claim` and `/me/claim`. `approveClaimAndRejectRivals` copies it to `Business.ssm` on approval; the admin's approve passes `verifySsm` and lands on L2 via the shared `verifyBusinessSsm` (also used by the SSM queue). Email-code and domain approvals land on L1 with the number, which puts them in the SSM queue. `GET /admin/claims` adds `registerCheck` {listed, match, elsewhere}. A new business typed in by a claimant no longer gets `ssm` written at creation.
- Admin screen: "Approve claim + SSM", the register check line, and new intro copy.
- Known leftover: the owner Dashboard still says "SSM verification pending" for any L1 business, even when nothing is submitted (old hardcoded copy).

### 4. Founding = Pro until a set date — **done 11 Oct** (tests: `backend/tests/founding.mjs`)
- A setting for the Founding end date (a table or env, editable by an admin).
- Approval before launch sets `isFoundingMember` (no 100 cap) and `membershipTier "pro"` with expiry = the end date.
- Expiry enforced (lazily on read, plus a job): lapsed → `free`. Founding discount recorded for billing (amount TBD).
- Rewrite the pricing page's "Founding 100, by invitation only" copy.
- Built as: `AppSetting` table + lib/founding.js (`founding.closesAt`, `founding.proEndsAt`; GET/PUT `/admin/settings/founding`, panel on the admin claims screen). `Business.membershipTierGrant` ("founding" | "admin" | "paid") so a date change moves only Founding grants. lib/membershipExpiry.js: `effectiveMembershipTier` (used by `can()` and the vouch cap) plus an hourly sweep started in src/index.js. Migration 20261011110000_founding_and_plan_grants also moves existing founding members from Plus to Pro (grant "founding", no expiry).
- Pricing copy rewritten ("Founding members — join before launch"); the Plan page states the term ("Founding Pro — free until …").
- **To do by you:** set the two dates on the admin claims screen once launch is decided. Until then Founding is open and Pro has no end.
- Discount amount: not stored. `isFoundingMember` is the key billing will use.

### 5. Contact details for logged-in members on every listing — **done 11 Oct** (tests: `lookup.mjs` §8; checked in the browser)
- `contactVisibility`: logged-in viewer → visible on every listing, regardless of the owner's plan. Anonymous → hidden.
- Drop `contactDetails` from the entitlements registry; update Plus's pricing copy (it no longer sells contact visibility).
- Check the profile and upgrade copy that says "Plus publishes your contact details".
- Built as: `contactVisibility` is now "logged in → visible"; `contactDetails` removed from both entitlement registries and the upgrade prompts; the owner's "your details are hidden" warning removed; the plan table's contact row is ticked for Free. Unclaimed profiles (ProfileSections.jsx) now show phone/email to members, with "These details come from public sources, not the business."
- **Plus now sells:** giving and publishing vouches, testimonials, network overlap, the NFC card. Worth a pricing-copy pass.

### 6. Pay-first: the plan clock starts at SSM — **done 11 Oct** (tests: `founding.mjs` §6)
- The admin plan screen: a plan set on an L1 business stores "paid, starts at verification"; the SSM approval sets `membershipTierStartedAt` and the expiry (+12 months).
- Refund on a failed SSM is manual (admin), with a note on the claims screen.
- Built as: `POST /admin/businesses/:id/membership-tier` takes `paid: true` (a sale). On an L2+ business the year starts now; below L2 it parks in `Business.pendingMembershipTier`, and `verifyBusinessSsm` starts it (grant "paid", 12 months). Revoking the claim clears a parked tier. The admin plan form has a "Paid — a year from SSM verification" checkbox and an amber "refund if verification fails" note; the member's Plan page explains the wait.

## Next, after these six
- **Deploy.** Nothing here is committed. Dev and prod need four migrations (20261011090000_add_claim_codes, 20261011100000_account_claim_ssm, 20261011110000_founding_and_plan_grants, and the earlier 20261003090000_add_source_records), which the deploy applies.
- **A real mail provider on prod.** 12 Oct: Resend removed at the user's request; mail now goes over plain SMTP (`SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`). Prod needs an SMTP account (Google Workspace / Zoho for hello@abri.asia, or Amazon SES) plus SPF/DKIM on abri.asia. A production build never shows links on screen; dev needs `MAIL_SHOW_LINKS=1` while it has no SMTP.
- Set the Founding dates once launch is decided.
- Update ABRI-feature-checklist.md: it still describes the founding-100 cap and Plus selling contact details.
- ~~Small leftovers: the owner Dashboard's hardcoded "SSM verification pending" banner; the fake "47 profile views".~~ Done 12 Oct: the dashboard reads the real 30-day viewer count (GET /watches/viewers) and its banner says "add your SSM number" or "waiting on review" from Business.ssm. The NFC card page no longer shows invented taps, card ID or status ("Not printed yet"; appMockData.js deleted).
- ~~Pricing sells unbuilt features.~~ Done 12 Oct: removed the rows for view alerts + weekly summary, search ranking, referral tracker, card scanner and team accounts; the SSM badge row is now every plan. Landing copy no longer claims every company is verified, automatic director matching, or "verified in minutes".
- **Launch review, user's rulings (12 Oct):** founders don't pay (everyone joining now is Founding), so founders see no upgrade buttons; NFC cards are printed by hand for claimed + verified members; changing or removing a listing is claim-only (no report form), and personal-data requests go to the contact email; data credits deferred.
- Done 12 Oct: About, Contact, FAQ, Privacy and Terms pages (`frontend/src/pages/legal/`; Privacy and Terms carry a "Draft, awaiting legal review" banner). Sign-up's last step no longer asks for a phone code nothing sent, and no longer dead-ends on the domain path once mail is configured; it states the Terms.
- **Before launch, fill in `frontend/src/lib/site.js`:** CONTACT_EMAIL and COMPANY_LEGAL_NAME (both show as [brackets] until then), and set LEGAL_DRAFT false after the lawyer's read. Still open: "[ replace with product photography before launch ]" on the landing NFC section.

## Deferred, on purpose
- Two staff from one company (the 2nd is treated as a rival claim) — Enterprise work.
- Acting on unclaimed listings (invite-to-claim means emailing scraped addresses; PDPA question).
- A real payment system; the Founding end date and the discount amount.
