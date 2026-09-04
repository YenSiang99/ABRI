# ABRI — What to Build

**Every feature in plain words, in the order it should be built.**
Strategy, positioning, financial model and stage gates live in `ABRI-master-blueprint.md`. This file is only the build list.

| Plan       | Price             | Its job                                  |
| ---------- | ----------------- | ---------------------------------------- |
| Free       | RM0               | "People can find me."                    |
| Plus       | RM490/year        | "People can trust me."                   |
| Pro        | RM1,490/year      | "The network brings me business."        |
| Enterprise | from RM3,500/year | "One account for my whole organisation." |

`[Built]` working · `[Partial]` half there · `[To build]` nothing yet

Status checked against the repo on 25 Aug 2026 — every `[x]` in §1 audited against a real route and real persistence, not just a screen.

---

## 1. Core — the platform

Everything here works the same for every business. **Free is Core with limits**, so the free tier isn't a separate list — where Free is capped, the cap is written on the line.

**Done**

- [x] **Sign up and log in** — email and password, stay logged in.
- [x] **Claim your business** — find your listing, prove it by email, an admin approves. Rival claims get dropped.
- [x] **Listings already there** — 22 businesses seeded as "Unclaimed" (T0) in `backend/prisma/seed.js`, so they exist before anyone signs up. Sample rows ported from the old frontend fixture, **not** a real registry import — the actual SSM data pull is still to do.
- [x] **Public business page** — name, category, location, description, services, badges. Anyone can view it.
- [x] **Edit your own page** — the owner changes their own details, via `PATCH /businesses/me` (description, services and all six contact fields). **Free too** — the route asks for an approved claim and nothing else, and no plan gate has ever stood in front of it. The pricing table claimed otherwise until Aug 2026; the table was wrong, not the code. What Plus buys is the contact block being *visible*, not writable. Until Aug 2026 this was ticked but false: the dialog wrote to a localStorage store nothing read back, so it toasted "Profile updated" and changed nothing.
- [x] **Browse and search** — every business, searchable by name and category, filterable by verification level. **Location is shown but not searched** — `GET /businesses` matches `name` and `category` only. See "Search filters" in §2.
- [x] **Verification badge** — one badge, five levels: Listed, Claimed, SSM-Verified, and two for later.
- [x] **Vouching** — write, send back for changes, accept, cancel, expire. Every version kept.
  **Free 0 · Plus 20 · Pro 40 · Enterprise 100** per rolling 30 days — `backend/src/lib/vouchCap.js`. Receiving a *request* is unlimited on every plan.
  **Free cannot give a vouch, and cannot accept one.** Both are server-enforced by `giveVouch` / `acceptVouch` in `backend/src/lib/entitlements.js`; `POST /vouches` and `POST /vouches/:id/accept` answer 402 with the plan needed. Reverting is priced with accepting (it's a step towards publishing); **cancelling and flagging stay free on every plan** — a member must always be able to refuse a vouch or report an abusive one without paying.
  Net effect, worth stating plainly: **a Free business has no vouches at all.** Requests still land in their queue, with the notification and the full testimonial — that unanswerable request is the pitch.
- [x] **Report a bad vouch** — either side reports, the vouch freezes until an admin rules.
- [x] **Admin review screens** — approve claims, rule on reported vouches.
- [x] **Connections** — two businesses become linked, and **both sides have to agree**. A directory connect sends a request the other side accepts or declines; a card tap connects outright, because a tap is physical proof the two were in the same room, which is the evidence the approval step exists to collect (`AUTO_ACCEPT_SOURCES`).
  Until Aug 2026 anyone could press Connect and appear in a stranger's network unilaterally. In a directory built to make trust legible that is a **forgeable signal** — it only hadn't bitten because connections are private to each side's own screen, and "Suggested matches" would have routed real work through invented edges.
  Withdraw, decline and remove are one `DELETE`. **Declining leaves no record**: nothing stores that someone said no. Volume is the connection cap's problem, not this table's.
- [x] **Network is a section, not a page** — `/app/network` is a sidebar group with three routes under it: **Requests**, **Connections**, **Following** (which itself has Following / Followers tabs). They were one tabbed screen until Aug 2026, where the three read as three views of one list.
  The split is by whether there's work in it: a request is owed by somebody, so it gets its own route, its own sidebar badge (inbound only — a badge for requests *you* sent would nag about somebody else's work), and is where `connection_requested` notifications land. Connections and Followers are finished states, so they can sit behind tabs. Groups, when it arrives, is a fourth child here rather than a fifth top-level nav item — which is the point of paying for the nesting at three.
- [x] **Activity feed and unread count** — "someone vouched for you", "someone connected with you".
- [x] **NFC tap page** — tapping a card opens that business's page, no account needed (`/m/:businessId`, reads `GET /businesses/:id`). An anonymous tapper sees the verification badge and is asked to log in or register — contact details sit behind the same door as the connection. The member's own card screen (`frontend/src/pages/app/Card.jsx`) still renders tap counts and history from `frontend/src/data/appMockData.js`; **no tap is recorded anywhere**.
- [x] **The plan field** — each business stores `free / plus / pro / enterprise`, when it started, when it runs out.
- [x] **Founding-100 flag** — its own field (`isFoundingMember`), so a later upgrade or expiry can't erase it.
- [x] **One permission function** — `can(business, feature)` in `backend/src/lib/entitlements.js`. Every locked feature asks this before doing anything; each new gate adds a line there. `testimonials`, `contactDetails`, `giveVouch` and `acceptVouch` are enforced on the server. `nfcCard` is registered but shut in the UI only, because it has no endpoint yet.
- [x] **Public pricing table** — the four plans and what's in them, on the landing page.
- [x] **Upgrade prompt** — the other half of the locked-feature screen, and the pattern every priced *action* uses. The button stays visible and fully styled; clicking it opens a dialog naming the plan and what it buys. `frontend/src/components/app/UpgradePrompt.jsx` owns the copy so one gate reads identically wherever it's hit, and `useUpgradeGate(feature)` wraps the click handler. Live on: vouch (directory profile, Vouches page, vouch back, vouch again) and accept/revert (request card). The client check is UX only — the server answers 402 with `upgradeRequired` regardless.
  **Never hide a gated affordance.** A Free member finding fewer buttons learns nothing; one who reaches for a button and is told the price learns exactly what the tier costs them.
- [x] **Locked-feature screen** — says what the feature does, which plan includes it, and links to pricing. Where a business is behind on verification *and* plan, the verification message wins.
- [x] **Card preview for Free** — `/app/card` is not shut to Free members. It shows them the card artwork with their own name, category, SSM and tier on it, stamped "PREVIEW · NOT YET PRINTED", with one line of copy and a link to pricing. The sidebar still shows the lock. Withheld: the printed card itself, the status panel and the tap history.
  **The status panel and tap stats are omitted, not blurred.** They read "Active · shipped Jan 2026", a Card ID hardcoded for every member, and six invented taps — all false for a Free member and all fake for a paying one too. A blurred number implies a real number is behind it. Don't reveal these to Free when a real taps table lands either: a genuine zero sells nothing.
- [x] **Contact details** — six columns on the business: `phone`, `whatsapp`, `email` (withheld) plus `website`, `address`, `openingHours` (public on every plan). The withheld three cross the wire only when the OWNER is on Plus or above **and** the viewer is logged in. Stripped on the server by `publicBusinessView` in `backend/src/lib/accountView.js`; the rule is `backend/src/lib/contactVisibility.js`. The keys are absent from the payload, never masked on the client.
  **A free account is enough to see a paying member's details — the viewer's plan is deliberately not part of the gate.** Being logged in is anti-scraping, not billing. Neither LinkedIn nor Alignable paywalls contact details; both gate reach and insight instead, because charging the buyer for the privilege of contacting a paying seller paywalls that seller's own leads away from them. Don't reintroduce a viewer-side gate without revisiting that.
- [x] **Change a business's plan** — an admin sets the plan and an optional expiry from the claims screen (`POST /admin/businesses/:id/plan`). Founding status can't be stripped by it, and correcting only the expiry doesn't restart the membership. The expiry is recorded, not enforced — nothing downgrades on its own yet.

**Left to do**

- [ ] **Delete the last of the mock data** — mostly done. `frontend/src/lib/store/*` and `data/businesses.js` are gone (the `tierLabel`/`ladderLabel` maps moved to `lib/trustLabels.js`), and `appMockData.js` is down to one export after the introductions screen was deleted. **Still fake:** NFC tap stats on `pages/app/Card.jsx` (`appMockData.js`), the dashboard's hardcoded "47 profile views", and its pre-ticked verification steps. Each one still looks like a working feature. `[Partial]`
- [ ] **Search ranking by plan** — paid members above free ones. `[To build]`
- [ ] **Connection cap for Free** — outbound **requests** per period, not edges. Capping something anyone could create unilaterally was never going to hold; now that a request lands on someone's desk, a cap on sending them means something. Following stays uncapped on every plan. `[To build]`
- [x] **Follow a business** — one-way, no approval, and **unannounced**: nobody is notified when you follow them, no activity event is written, and nobody is told when you stop. A business *can* read its own follower list (Network → Following → Followers), which is the one thing it can see.
  What stays off the table is a **follower count on a profile**, anywhere. That's the half that can't be taken back — a number on a page gets solicited, farmed and compared, and following stops being a private signal about the follower and becomes a public score for the followed. Both reads are one query against the same index; only one is reversible.
  **What a follow gets you: opening the profile. That's the whole list.** Anything involving the other party — messaging, introductions, collaboration — requires a **connection**, because a connection took two people to make and a follow took one. That's the line to hold as features get added.
  Deliberately not a weaker connection, and independent of one: you can follow a business you're connected to, and disconnecting doesn't silently drop a watchlist entry nobody asked to lose. **Uncapped on every plan, Free included** — Free needs something genuinely useful it can do, and a private list costs nobody anything.
  `Follow` table, `/follows` routes (`GET /`, `GET /followers`, `POST`, `DELETE /:businessId` — both reads keyed off the session, never a path id), `FollowsContext`. Following an unclaimed (T0) listing is refused: there's no owner, so nothing could ever appear. "Tell me when this gets claimed" is a better feature and the reason to revisit that line.
- [ ] **Messaging** — the action a connection unlocks and a follow doesn't. Connections only, by design: it's the payoff that makes the accept step worth having, and the reason a forgeable connection would have been a real problem rather than a cosmetic one. Nothing built yet. `[To build]`
- [ ] **"Get verified" prompt** — a permanent banner on a free member's own dashboard. `[To build]`
- [ ] **Sending WhatsApp messages** — one shared pipe. Every alert, digest and reminder below uses it, so build it once and well. `[To build]`
- [ ] **Payment and renewal** — take the money, set the expiry, remind before it runs out, drop to Free if unpaid. `[To build]`

---

## 2. Plus — RM490/year

Proof the business is real, and a reason to open the app each week. This is the volume tier — most paying members should sit here.

- [x] **Testimonials shown** — the written vouches appear on the page. Free sees the count ("12 vouches"), not the words. Server-enforced. `[Built]`
- [ ] **SSM verification** — member submits their registration number, ABRI checks it and matches a director's name, badge goes up a level. The status screen exists (`frontend/src/pages/app/Verify.jsx`); there's no way to submit and no admin queue. `[Partial]`
- [ ] **Full business page** — logo, longer description, website, opening hours. Website, address and opening hours now exist and are owner-editable via `PATCH /businesses/me` — which is also the first route that let an owner edit anything at all. Only the logo is missing (it needs file storage and an upload route). `[Partial]`
- [ ] **NFC card ×1** — the physical card. The tap page is built and Free members now see a preview of the card face; ordering, printing and posting are not built, and **nothing records a tap anywhere** — no endpoint, no table, no column. Every figure on the card screen's stats and history is invented, for paying members as much as free ones. That is the part to fix before Plus is sold on it. `[Partial]`
- [ ] **Search filters** — narrow by category, location, industry, verification level. `[Partial]`
- [x] **Your contact details visible** — a Plus member's phone, WhatsApp and email are shown to logged-in members; on Free they're withheld from everyone. This is the owner-side half of the Core switch, and the only half being sold.
  Seeing *other* members' details needs no plan at all — a free account clears it. The earlier wording ("see other members' phone and email") promised a viewer-side gate that was deliberately not built; see §1 for why. `[Built]`
- [ ] **Milestone badges** — First Vouch, 5 Vouches, Trusted Business at 10. Counted from vouches they already have. `[To build]`
- [ ] **Shareable milestone image** — a picture sized for LinkedIn and WhatsApp status. Cheap, and every share is free advertising. `[To build]`
- [ ] **Who viewed my page** — a list of businesses that opened their profile, newest first. `[To build]`
- [ ] **View alert on WhatsApp** — a message when someone views them. Needs a daily cap or it becomes noise. `[To build]`
- [ ] **Weekly summary on WhatsApp** — views, new vouches, new connections. Built from activity already recorded. Shape in §7. `[To build]`
- [ ] **Save a business** — a bookmark list. `[To build]`
- [ ] **Save a search** — re-run a common search with one tap. `[To build]`
- [ ] **Ranked above Free in search** — the other half of Core's ranking work. `[To build]`

---

## 3. Pro — RM1,490/year

The tools that turn a directory into leads. This tier has to survive *"what did I get for my money?"* — which is why the referral tracker comes first.

- [ ] **Referral tracker** — a table the member fills in: who I sent, to whom, when, and whether it became work (Pending / Won / Not pursued). Four buttons: add, edit, mark won, mark not pursued. **Build this before anything else in Pro** — two features below are only ways of reading it. `[To build]`
- [ ] **Referral summary** — the same table read back as numbers: sent, received, how many became work, who your best partner is. A screen over the tracker, not a second product. `[To build]`
- [ ] **"Looking for" and "Can offer" tags** — pick from the fixed lists in §7. Fixed, not free text, or matching won't work. `[To build]`
- [ ] **Requests board** — post "Looking for a corporate secretary in KL"; other members reply. Free and Plus can read it and not reply. Post categories in §7. `[To build]`
- [ ] **Suggested matches** — businesses whose "can offer" lines up with your "looking for", in your area and industry, best overlap first. Tag overlap, no AI. *(This one screen is everything the old docs called opportunity matching, smart introductions, referral matching, the recommendation engine and priority matching.)* `[To build]`
- [ ] **Introductions, or whatever replaces them** — pick two businesses, write one line on why they should talk, both get a WhatsApp. **The screen was deleted in Aug 2026** — it was mock data end to end, and a Pro feature that only pretends to work is worse than an absent one when the tier is being sold. Nothing is built: no table, no route, no screen, no `introductions` entitlement. Pro's pricing row now reads "Referral tracker" alone, which is also unbuilt, so **Pro currently has no delivered headline feature** — this or the tracker is the thing to fix before Pro is sold to anyone. `[To build]`
- [ ] **Introduction count on your page** — "Made 12 introductions". A public number that rewards being useful. `[To build]`
- [ ] **Enquiry inbox** — one screen holding every reply to your requests and every introduction sent to you. `[To build]`
- [ ] **Follow-up reminder** — put a date on a referral or enquiry, get a WhatsApp that day. `[To build]`
- [ ] **Business card scanner** — photograph a paper card, we read the company name and say whether they're on ABRI and verified, with a button to connect or invite. Every scan saved. This is what gets the app opened on an ordinary Tuesday. `[To build]`
- [ ] **Full page statistics** — views over time, which industries looked, card taps, vouches over time. `[To build]`
- [ ] **Badge for their website** — a "Verified on ABRI" image with a live vouch count. Every member's site becomes a link back. `[To build]`
- [ ] **Written weekly summary** — Monday WhatsApp in plain language: *"You sent 4 referrals and received 3. Two turned into work. You're 3 vouches from Trusted Business."* `[To build]`
- [ ] **Introduction writer** — three boxes (who, who, why), out comes a polished message. Cheapest thing on this list. `[To build]`
- [ ] **Top of search results** — above Plus, above Free. `[To build]`

*Not on this list on purpose: CRM-lite. What people want from those words is the referral tracker, the follow-up reminder and the enquiry inbox — all three are already here. A real CRM competes with tools your members already pay for.*

---

## 4. Enterprise — from RM3,500/year

Everything in Pro, for many people at once. Sold to firms with staff, and to associations and chambers who want a private verified member list.

**Build nothing here until someone has signed.** Every item is a week or more, and none of it helps a single-person member. It's on this list so it can be quoted in a sales conversation.

- [ ] **Several people under one business** — the database already allows it (`Account.businessId`); the app assumes one person per business. `[Partial]`
- [ ] **Roles** — Owner, Admin, Member. Who edits the page, who vouches on its behalf, who pays.
- [ ] **Invite a colleague** — an email invite that joins the existing company instead of creating a new one.
- [ ] **Team dashboard** — every staff member's vouches, connections and referrals in one screen.
- [ ] **Team statistics** — which staff member actually generates business relationships.
- [ ] **One NFC card per staff member** — bulk ordering against one account.
- [ ] **Bulk verification** — an association uploads its member list as a spreadsheet, verified as a batch.
- [ ] **White-label** — sold as one word, built as five: private directory · private requests board · their logo and colours · their own web address · ABRI branding removed.
- [ ] **Fast-track verification** — their members jump the SSM queue. Mostly an admin setting.
- [ ] **API access** — another system reads the verified member list. Only build it when a partner has asked in writing.

A named contact and guided setup are also part of Enterprise, but they're people, not software.

---

## 5. Build next

Each block is worth shipping on its own. Don't start one before the block above it is done — later features read data earlier ones create.

1. ~~**Make plans real.**~~ ▸ **Done.** Plan field, permission function, vouch caps, the locked-feature screen and admin plan changes. A plan can now be sold and fulfilled by hand.
2. ~~**Make Plus worth RM490.**~~ ▸ *Mostly done.* Testimonials, the NFC card gate and **contact details** are all shipped — the last of those also brought the first real owner-edit route (`PATCH /businesses/me`), so a member can change their own page for the first time. Still open in this block: the SSM verification flow, milestone badges and search ranking.
3. **Turn on messages.** ▸ *You are here.* WhatsApp sending, then view alerts and the weekly summary on top of it. One pipe, several uses — it's what makes membership felt between logins.
4. **Referral tracker.** The first Pro feature and the highest-leverage item on the whole list; the referral summary and the written weekly summary are both just readings of this table.
5. **Tags and the requests board.** Looking for / can offer, post, reply, tag matching. This is the part that generates actual leads.
6. **Real introductions.** Replace the fake data, send the WhatsApp to both sides, show the count on the profile.
7. **Card scanner.** The daily-habit feature. Build it once Pro is already worth buying.
8. **Statistics and the written features.** Page statistics, website badge, Monday summary, introduction writer.
9. **Enterprise.** Only with a signed customer, and only the parts that customer asked for.

---

## 6. Rules

### Never build

- **Accounting software** — competes with QuickBooks, Wave, SQL, AutoCount. Outside core value.
- **Full CRM** — members already have one. See the note at the end of §3.
- **Payment processing** — needs BNM licensing. Only via a licensed partner, much later.
- **A marketplace, escrow, or procurement platform** — needs transaction volume that won't exist for years.
- **AI matching** — needs data density the directory won't have for a long time. Tag overlap until then.
- **Paid "featured" placement** — you're selling "verified businesses rank higher"; selling the top slot separately contradicts that on the same screen.
- **More than four tiers** — too many value propositions to sell at once.

### Non-negotiable, at every tier

- **No advertising, ever** — not in any tier, at any price. It contradicts the trust brand.
- **Member data is never sold** — the badge's credibility is worth more than any data revenue.
- **Vouch integrity** — only verified members can vouch. Fake vouching means termination.
- **Verification cannot be bought** — SSM verification is the gate to Plus and Pro. You cannot pay your way to a verified badge.

### Rough effort and running cost

| Feature                    | Effort                        | Third-party cost                                           |
| -------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Business card scanner      | 2–3 weeks, 1 dev              | ~USD 0.0015 per scan (OCR — Google Vision or AWS Textract) |
| Referral tracker + summary | 3–4 weeks                     | none                                                       |
| Written weekly summary     | ~1 week on top of the tracker | ~USD 0.01 per member per week (Claude API)                 |
| Introduction writer        | ~1 week                       | ~USD 0.005 per introduction                                |

### Dropped

- **Ask for a vouch.** Cut Aug 2026, never built. Vouching is a give-first motion — asking inverts it into a favour you chase, and a vouch you had to solicit is worth less as a signal than one that arrived unprompted. The "Requests" tab stays what it is: inbound in-flight vouches, not asks.

### Two calls worth revisiting

- ~~**Free can give 3 vouches a month.**~~ **Reversed, Aug 2026.** Free gives nothing and accepts nothing. The small allowance was defended on the grounds that vouches are what make the directory worth reading — the counter-argument that won is that a vouch a Free member can't publish is a better advertisement for Plus than three they can, and that a Free profile showing zero vouches makes the tier's value visible on the page itself. Still one number in `vouchCap.js` plus two lines in `entitlements.js` to reverse again.
  **The risk to watch:** early network density. If the directory looks empty because too few members are paying, this is the first call to revisit.
- **No AI in matching.** Tag overlap only. The two AI features are the written weekly summary and the introduction writer; neither holds up the price alone, so if they slip nothing breaks.

---

## 7. The fixed lists

Carried over from `ABRI_V6_Pricing_and_Feature_Architecture-2.md`, now deleted — this is the only copy. These are build input, not strategy: matching is tag overlap, so the tags have to be a closed list both sides pick from.

### I am looking for

Customers · Suppliers · Distributors · Investors · Partners · Employees · Service providers · Export partners

### I can offer

Accounting · Legal · Manufacturing · IT · Marketing · Logistics · Financing · Consulting

Match on these plus category, location, industry and business size. Sort by best overlap. No AI.

### A request can be posted under

Customer requirement · Supplier requirement · Partnership · Distribution · Export · Service requirement · Collaboration

### The weekly summary, in shape

> **Your ABRI Weekly**
>
> - 5 businesses you should know
> - 3 potential customers
> - 2 suppliers matching your needs
> - 4 new businesses in your industry
> - 1 introduction opportunity

Rule-based, not written by a model. The Pro version (§3) is the same data put into sentences.
