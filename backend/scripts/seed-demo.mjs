// Turns the 22 bare listings from prisma/seed.js into a network that has
// actually been used, so every feature has something to show.
//
//   node scripts/seed-demo.mjs
//
// WHY THIS IS SEPARATE FROM prisma/seed.js. That file seeds LISTINGS — 22
// unclaimed L0 rows with no owner, which is exactly right for exercising the
// claim flow and exactly wrong for demoing anything else. A directory of 22
// unclaimed rows renders 22 identical grey cards; the feed is empty; check-a-
// business finds a name and can say nothing about it; the asks board says
// "nobody has posted an ask yet". Every one of those screens is working
// correctly and looks broken.
//
// This layers the part that makes them mean something: owners, verification,
// registration numbers, a vouch graph, connections, asks, and the feed events
// that announce all of it.
//
// IDEMPOTENT. Every row it writes carries a deterministic `demo-` id and is
// upserted, so re-running changes nothing. That is also what makes it safe
// beside prisma/seed.js, which owns the business rows themselves — this only
// ever moves verificationLevel/ssm/membershipTier on the businesses it names,
// and never touches a business it doesn't.
//
// NOT FOR PRODUCTION. It writes published vouches nobody wrote and accepted
// recommendations nobody made. On a real database that is fabricated trust
// evidence, which is the one thing this product cannot contain. The guard at
// the bottom of main() refuses to run against a non-local database unless
// ABRI_SEED_DEMO_CONFIRM is set.

import fs from "node:fs";

// DATABASE_URL, resolved FILE-relative rather than CWD-relative — the same
// fix backend/tests/ made when it moved out of the backend root. src/prisma.js
// constructs a bare PrismaClient and nothing here loads dotenv, so without
// this the script only works when run from exactly one directory.
if (!process.env.DATABASE_URL) {
  const envPath = new URL("../.env", import.meta.url);
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.startsWith("DATABASE_URL="));
    if (line) process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
}

// Dynamic, and it has to be: a static import is hoisted above the block
// above, so PrismaClient would be constructed before DATABASE_URL is set.
const { prisma } = await import("../src/prisma.js");
const { hashPassword } = await import("../src/lib/password.js");
const { normalizeSsm } = await import("../src/lib/businessLookup.js");
const { CLAIMED, SSM_VERIFIED } = await import("../src/lib/verificationLevels.js");
const { LEVEL_EVENT_LEVEL } = await import("../src/lib/networkEvents.js");

const DEMO_PASSWORD = "Demo1234!";

const now = Date.now();
const daysAgo = (n, hour = 10) => new Date(now - n * 86_400_000 + hour * 3_600_000);

// ── The roster ────────────────────────────────────────────────────────────
//
// Ten members at L2, three sitting in the SSM review queue, one claimed but
// not yet submitted, and eight left unclaimed. That spread is deliberate:
// each screen needs a business in every state to look like a real directory
// rather than a demo where everything is green.
//
// People names are Malaysian and mixed, because the corridor is. Emails sit
// on each business's own `domain`, which is also what makes the claim flow's
// domain-auto path demonstrable.
const MEMBERS = [
  {
    id: "meridian-accounting",
    person: "Tan Wei Ming",
    email: "weiming@meridianaccounting.my",
    phone: "60123451234",
    ssm: "201901008842",
    tier: "pro",
    founding: true,
    claimedDaysAgo: 96,
    verifiedDaysAgo: 92,
  },
  {
    id: "bangsar-legal-partners",
    person: "Sharmila Devi Ramasamy",
    email: "sharmila@bangsarlegalpartners.my",
    phone: "60122876611",
    ssm: "200801119043",
    tier: "pro",
    founding: true,
    claimedDaysAgo: 91,
    verifiedDaysAgo: 88,
  },
  {
    id: "bangsar-south-accounting",
    person: "Muhammad Danial bin Ismail",
    email: "danial@bangsarsouthaccounting.my",
    phone: "60132998104",
    ssm: "201801030925",
    tier: "pro",
    founding: false,
    claimedDaysAgo: 74,
    verifiedDaysAgo: 70,
  },
  {
    id: "sentul-corp-services",
    person: "Nurul Aisyah binti Rahman",
    email: "aisyah@sentulcorpservices.my",
    phone: "60193348820",
    ssm: "201203027715",
    tier: "plus",
    founding: true,
    claimedDaysAgo: 88,
    verifiedDaysAgo: 84,
  },
  {
    id: "novatech-consulting",
    person: "Lim Chee Keong",
    email: "cheekeong@novatechconsulting.my",
    phone: "60167304551",
    ssm: "202101033168",
    tier: "plus",
    founding: false,
    claimedDaysAgo: 67,
    verifiedDaysAgo: 61,
  },
  {
    id: "usj-corp-sec-partners",
    person: "Grace Wong Sze Ling",
    email: "grace@usjcorpsecpartners.my",
    phone: "60175520918",
    ssm: "201501018277",
    tier: "plus",
    founding: false,
    claimedDaysAgo: 59,
    verifiedDaysAgo: 55,
  },
  {
    id: "ttdi-corp-sec-studio",
    person: "Amirul Hakim bin Zulkifli",
    email: "amirul@ttdicorpsecstudio.my",
    phone: "60189907742",
    ssm: "202201041936",
    tier: "plus",
    founding: false,
    claimedDaysAgo: 44,
    verifiedDaysAgo: 39,
  },
  {
    id: "brickfields-corp-services",
    person: "Kavitha Nair",
    email: "kavitha@brickfieldscorpservices.my",
    phone: "60172749018",
    // The letterhead shape — both the post-2016 number and the old one, which
    // is how it is actually printed. This row is the reason ssmTokens() and
    // ssmNormalized exist, so the demo data has to contain one.
    ssm: "199801007712 (472119-K)",
    tier: "free",
    founding: false,
    claimedDaysAgo: 38,
    verifiedDaysAgo: 33,
  },
  {
    id: "sunway-legal-group",
    person: "Chong Yee Ling",
    email: "yeeling@sunwaylegalgroup.my",
    phone: "60164418200",
    ssm: "201001016604",
    tier: "free",
    founding: false,
    claimedDaysAgo: 31,
    verifiedDaysAgo: 27,
  },
  {
    id: "puchong-tax-advisory",
    person: "Ahmad Faizal bin Hassan",
    email: "faizal@puchongtaxadvisory.my",
    phone: "60138702255",
    ssm: "201701024590",
    tier: "free",
    founding: false,
    claimedDaysAgo: 22,
    verifiedDaysAgo: 17,
  },
];

// L1 + a registration number IS the pending state — routes/admin.js derives
// the review queue from `verificationLevel: CLAIMED, ssm: { not: null }`
// rather than from a status column. So these three populate /admin/ssm-reviews
// simply by existing.
const PENDING_SSM = [
  {
    id: "clearpath-corp-sec",
    person: "Farah Adilah binti Osman",
    email: "farah@clearpathcorpsec.my",
    phone: "60127713004",
    ssm: "202301045128",
    claimedDaysAgo: 9,
  },
  {
    id: "subang-it-solutions",
    person: "Ravi Chandran",
    email: "ravi@subangitsolutions.my",
    phone: "60196628845",
    ssm: "202004012663",
    claimedDaysAgo: 6,
  },
  {
    id: "mont-kiara-accounting-co",
    person: "Yeoh Su Lin",
    email: "sulin@montkiaraaccountingco.my",
    phone: "60123380671",
    // Pre-2016 format, on purpose: an admin reviewing the queue should see
    // both shapes, because both still arrive.
    ssm: "859032-T",
    claimedDaysAgo: 3,
  },
];

// Claimed, but hasn't submitted a number yet — the state between L1 and the
// review queue, and the one that shows the "Get verified" prompt with nothing
// pending behind it.
const CLAIMED_ONLY = [
  {
    id: "cheras-accounting-hub",
    person: "Hafiz bin Abdullah",
    email: "hafiz@cherasaccountinghub.my",
    phone: "60194402277",
    claimedDaysAgo: 12,
  },
];

// ── The vouch graph ───────────────────────────────────────────────────────
//
// Uneven ON PURPOSE. A graph where everyone has four vouches makes vouchLevel
// a constant and the directory's sort meaningless. This runs 5 down to 0, and
// two L2 members (novatech, puchong-tax) end with none — a verified business
// with no vouches yet is the most common real state and the ladder has to
// show it.
//
// Every giver is L2+, mirroring VOUCHABLE_VERIFICATION_LEVELS in
// routes/vouches.js. Seeding a vouch the API would have refused would make
// the demo prove something the product doesn't do.
const VOUCHES = [
  ["sentul-corp-services", "meridian-accounting", 78, "We hand Meridian every client that outgrows our in-house bookkeeping. Three years, no filing ever late, and they call us before a deadline slips rather than after."],
  ["bangsar-legal-partners", "meridian-accounting", 71, "Meridian handled the accounts for two of our clients through a messy restructuring. They explained the tax position in language a director could actually act on."],
  ["novatech-consulting", "meridian-accounting", 64, "They took over our books mid-year with the previous agent's records in poor shape and had us clean by the next quarter. Straight answers on cost from the first meeting."],
  ["usj-corp-sec-partners", "meridian-accounting", 52, "We work alongside Meridian on shared clients. Their annual-return turnaround is the fastest we deal with and they never leave us chasing documents."],
  ["ttdi-corp-sec-studio", "meridian-accounting", 35, "Referred four startups to Wei Ming's team. Every one stayed. They price honestly for early-stage work instead of quoting for a company ten times the size."],

  ["bangsar-legal-partners", "usj-corp-sec-partners", 69, "Grace's team did the secretarial work on a group restructuring we ran. Board resolutions and filings came back same-week, every week."],
  ["sentul-corp-services", "usj-corp-sec-partners", 57, "A competitor, and we still refer overflow to them. That should say enough."],
  ["bangsar-south-accounting", "usj-corp-sec-partners", 41, "Reliable on the compliance calendar and genuinely useful when a client's structure gets complicated. They flag problems early."],
  ["sunway-legal-group", "usj-corp-sec-partners", 28, "Handled an urgent share transfer for a mutual client over a long weekend. No drama, no surcharge."],

  ["meridian-accounting", "bangsar-legal-partners", 74, "We refer every contract dispute to Sharmila. She tells clients when they don't have a case, which is worth more than a lawyer who bills the fight."],
  ["usj-corp-sec-partners", "bangsar-legal-partners", 48, "Drafted the shareholder agreements for two incorporations we ran. Clear documents, and they turned comments around in days."],
  ["bangsar-south-accounting", "bangsar-legal-partners", 26, "Advised on an employment matter with a real risk of going public. Discreet, and the advice held up."],

  ["meridian-accounting", "sentul-corp-services", 66, "Aisyah's team has done our own secretarial work since we incorporated. Filings on time, and they chase us rather than the other way round."],
  ["brickfields-corp-services", "sentul-corp-services", 45, "We've co-delivered on a few group incorporations. Organised, and they carry their half without being managed."],
  ["ttdi-corp-sec-studio", "sentul-corp-services", 21, "Took an overflow incorporation off us at two days' notice and treated the client better than we would have had time to."],

  ["novatech-consulting", "ttdi-corp-sec-studio", 30, "Amirul's studio incorporated our subsidiary and sorted the MSC paperwork. Fast, and they understood the tech-company specifics without a briefing."],
  ["meridian-accounting", "ttdi-corp-sec-studio", 19, "Good with founders. They explain what a company secretary actually does instead of just sending an invoice for it."],

  ["sentul-corp-services", "bangsar-south-accounting", 33, "Danial's team picked up a client we could not service and kept us in the loop the whole way. Professional throughout."],
  ["bangsar-legal-partners", "bangsar-south-accounting", 15, "Solid tax advisory on a cross-border question where we needed a second opinion quickly."],

  ["puchong-tax-advisory", "brickfields-corp-services", 24, "Kavitha's team handled the compliance side of a client we share. Nothing dropped, and their file notes are better than ours."],
  ["novatech-consulting", "sunway-legal-group", 12, "Reviewed our standard services agreement and found two clauses that would have cost us. Practical, not academic."],
];

// ── Connections and follows ───────────────────────────────────────────────
//
// Connections are the mutual edge that powers the "vouched for by N in your
// network" overlap on check-a-business; follows are one-way and drive the
// feed's "Following" scope. Both are seeded so those two features have
// something to compute against for whoever you log in as.
const CONNECTIONS = [
  ["meridian-accounting", "sentul-corp-services", "in_app", 82],
  ["meridian-accounting", "bangsar-legal-partners", "in_app", 76],
  ["meridian-accounting", "usj-corp-sec-partners", "nfc_tap", 58],
  ["meridian-accounting", "ttdi-corp-sec-studio", "in_app", 37],
  ["sentul-corp-services", "usj-corp-sec-partners", "in_app", 61],
  ["sentul-corp-services", "brickfields-corp-services", "nfc_tap", 47],
  ["bangsar-legal-partners", "usj-corp-sec-partners", "in_app", 70],
  ["bangsar-legal-partners", "bangsar-south-accounting", "in_app", 29],
  ["novatech-consulting", "meridian-accounting", "in_app", 65],
  ["novatech-consulting", "ttdi-corp-sec-studio", "nfc_tap", 32],
  ["sunway-legal-group", "usj-corp-sec-partners", "in_app", 30],
  ["puchong-tax-advisory", "brickfields-corp-services", "in_app", 25],
];

const FOLLOWS = [
  ["novatech-consulting", "meridian-accounting", 63],
  ["novatech-consulting", "bangsar-legal-partners", 63],
  ["novatech-consulting", "usj-corp-sec-partners", 40],
  ["puchong-tax-advisory", "meridian-accounting", 20],
  ["puchong-tax-advisory", "bangsar-south-accounting", 18],
  ["sunway-legal-group", "bangsar-legal-partners", 26],
  ["sunway-legal-group", "meridian-accounting", 25],
  ["ttdi-corp-sec-studio", "meridian-accounting", 34],
  ["ttdi-corp-sec-studio", "sentul-corp-services", 33],
  ["brickfields-corp-services", "sentul-corp-services", 44],
  ["brickfields-corp-services", "meridian-accounting", 43],
  ["usj-corp-sec-partners", "bangsar-legal-partners", 55],
  ["bangsar-south-accounting", "meridian-accounting", 68],
  ["sentul-corp-services", "meridian-accounting", 80],
  ["meridian-accounting", "bangsar-legal-partners", 75],
];

// ── Asks ──────────────────────────────────────────────────────────────────
//
// Every poster is L2+, mirroring canPostAsks(). Two asks carry an accepted
// answer, which is what writes a recommendation_published row into the feed —
// and one of those recommends an UNCLAIMED listing, so the T0 rule in
// visibleNetworkEventsWhere has a live example: that row exists and stays
// invisible until somebody claims the listing.
const ASKS = [
  {
    id: "demo-ask-restructure-cosec",
    by: "meridian-accounting",
    category: "Service requirement",
    matchCategory: "Corporate Secretarial",
    matchLocation: "Petaling Jaya",
    title: "Company secretary for a three-entity group restructuring",
    detail:
      "Client is collapsing three operating companies into one holding structure before a funding round. Needs someone who has done a group restructuring end to end, not just annual returns. Timeline is about eight weeks.",
    daysAgo: 26,
    answers: [
      { by: "usj-corp-sec-partners", recommends: "usj-corp-sec-partners", accepted: true, comment: "We've run four of these in the last two years, including one with a foreign shareholder. Happy to walk through the sequencing before you commit — the order the entities are wound matters more than most people expect." },
      { by: "sentul-corp-services", recommends: "sentul-corp-services", comment: "We can take this. Two of our team have done group restructurings under the same timeline. Can share a redacted example of the resolution set." },
      { by: "bangsar-legal-partners", recommends: "ttdi-corp-sec-studio", comment: "Not our line of work, but Amirul at TTDI has done exactly this for a client of ours. Worth a call." },
    ],
  },
  {
    id: "demo-ask-msc-tax",
    by: "novatech-consulting",
    category: "Service requirement",
    matchCategory: "Accounting & Tax",
    matchLocation: "Shah Alam",
    title: "Tax agent who actually understands MSC status incentives",
    detail:
      "We've been quoted by two firms who clearly hadn't dealt with MSC-status conditions before. Looking for someone who has filed for a company under the incentive and knows what the conditions look like in practice.",
    daysAgo: 19,
    answers: [
      { by: "meridian-accounting", recommends: "meridian-accounting", accepted: true, comment: "We file for three MSC-status companies currently. The part most firms miss is the annual conditions reporting — happy to show you what that looks like before you decide." },
      { by: "bangsar-south-accounting", recommends: "bangsar-south-accounting", comment: "We handle two under the incentive. Can quote if you're still comparing." },
      { by: "usj-corp-sec-partners", recommends: "puchong-tax-advisory", comment: "Faizal at Puchong Tax has done MSC filings for a mutual client. Smaller shop, very hands-on." },
    ],
  },
  {
    id: "demo-ask-cloud-migration",
    by: "bangsar-legal-partners",
    category: "Supplier requirement",
    matchCategory: "IT Consulting",
    matchLocation: "Bangsar",
    title: "Cloud migration partner for a 40-seat legal practice",
    detail:
      "Moving off an on-premise file server. Document confidentiality is the hard requirement — we need someone who has done this for a firm under professional privilege obligations, not a generic office migration.",
    daysAgo: 14,
    answers: [
      { by: "novatech-consulting", recommends: "novatech-consulting", comment: "We've migrated two practices with the same constraint. The privilege question mostly comes down to where the data lands and who holds the keys — we can scope that in a first session." },
      { by: "meridian-accounting", recommends: "subang-it-solutions", comment: "Ravi's team did ours. Careful with access control, and they documented everything for our own audit." },
    ],
  },
  {
    id: "demo-ask-employment-counsel",
    by: "usj-corp-sec-partners",
    category: "Service requirement",
    matchCategory: "Law",
    matchLocation: "Subang Jaya",
    title: "Employment counsel for a redundancy exercise",
    detail:
      "Client is restructuring and will need to let roughly a dozen people go. Wants it done properly and quietly. Needs someone experienced with the notification requirements.",
    daysAgo: 11,
    answers: [
      { by: "bangsar-legal-partners", recommends: "bangsar-legal-partners", comment: "This is squarely our work. The sequencing and the paper trail are what determine whether this becomes a claim later — happy to talk the client through it directly." },
      { by: "novatech-consulting", recommends: "sunway-legal-group", comment: "Chong at Sunway Legal handled something similar for a client of ours last year. Very steady under pressure." },
    ],
  },
  {
    id: "demo-ask-sst-partnership",
    by: "bangsar-south-accounting",
    category: "Partnership",
    matchCategory: "Accounting & Tax",
    matchLocation: "Kuala Lumpur",
    title: "Partner firm to co-deliver SST advisory in Penang",
    detail:
      "We have three clients with Penang operations and no presence there. Looking for a firm to co-deliver rather than refer away — happy to structure it as a revenue share.",
    daysAgo: 8,
    answers: [
      { by: "meridian-accounting", recommends: "meridian-accounting", comment: "We don't have a Penang office either, but we've co-delivered this way twice and can share how we structured it if that's useful." },
    ],
  },
  {
    id: "demo-ask-incorporation-overflow",
    by: "ttdi-corp-sec-studio",
    category: "Collaboration",
    matchCategory: "Corporate Secretarial",
    matchLocation: "Kuala Lumpur",
    title: "Referral partner for startup incorporation overflow",
    detail:
      "We're turning away roughly five incorporations a month and would rather send them somewhere good than let them find whoever ranks first on Google. Looking for one or two firms to build a proper referral relationship with.",
    daysAgo: 5,
    answers: [
      { by: "sentul-corp-services", recommends: "sentul-corp-services", comment: "We'd take these. We already do overflow for two firms and can turn an incorporation around in under a week when the documents are clean." },
      { by: "usj-corp-sec-partners", recommends: "usj-corp-sec-partners", comment: "Interested. Our early-stage pricing is built for exactly this volume." },
      { by: "meridian-accounting", recommends: "clearpath-corp-sec", comment: "Farah at Clearpath is building a startup-focused practice and would likely welcome these." },
    ],
  },
  {
    id: "demo-ask-dms-vendor",
    by: "sunway-legal-group",
    category: "Supplier requirement",
    matchCategory: "IT Consulting",
    matchLocation: "Subang Jaya",
    title: "Document management system for a small practice",
    detail:
      "Twelve people, currently on shared drives and email. Want something with proper version history and access control that our team will actually use.",
    daysAgo: 2,
    answers: [
      { by: "novatech-consulting", recommends: "novatech-consulting", comment: "We've deployed two of these at similar size. The adoption problem is bigger than the software choice — worth a conversation about that before you pick a product." },
      // Recommends an UNCLAIMED listing. This answer is real and visible on
      // the board; the feed row it would produce stays dark until Klang IT
      // Partners claims their listing. That is the T0 growth loop, live.
      { by: "sunway-legal-group", recommends: "klang-it-partners", accepted: true, comment: "Answering my own ask to record this — Klang IT Partners did our last rollout and were excellent. Putting it here so it's on the record for whoever searches next." },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────

async function upsertAccount({ id, businessId, person, email, phone, hash, claimedDaysAgo, method }) {
  const data = {
    email,
    phone,
    name: person,
    role: "owner",
    passwordHash: hash,
    emailVerified: true,
    phoneVerified: true,
    businessId,
    claimStatus: "approved",
    verificationMethod: method,
    createdAt: daysAgo(claimedDaysAgo),
  };
  await prisma.account.upsert({ where: { id }, update: data, create: { id, ...data } });
}

// Written directly rather than through createNetworkEvent(), for one reason:
// that helper cannot backdate. A feed whose 40 rows all landed in the same
// second is not a demo of a feed. toVerificationLevel still comes from
// LEVEL_EVENT_LEVEL rather than a literal, so this cannot disagree with the
// visibility rule about what a business_claimed row means.
async function upsertEvent({ id, type, subjectBusinessId, actorBusinessId = null, vouchId = null, askAnswerId = null, at }) {
  const data = {
    type,
    subjectBusinessId,
    actorBusinessId,
    vouchId,
    askAnswerId,
    toVerificationLevel: LEVEL_EVENT_LEVEL[type] ?? null,
    createdAt: at,
  };
  await prisma.networkEvent.upsert({ where: { id }, update: data, create: { id, ...data } });
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  if (!isLocal && !process.env.ABRI_SEED_DEMO_CONFIRM) {
    console.error(
      "Refusing to run against a non-local database.\n" +
        "This writes published vouches and accepted recommendations that nobody made.\n" +
        "If you really mean to seed a shared environment, re-run with:\n" +
        "  ABRI_SEED_DEMO_CONFIRM=1 node scripts/seed-demo.mjs",
    );
    process.exit(1);
  }

  const missing = [];
  for (const b of [...MEMBERS, ...PENDING_SSM, ...CLAIMED_ONLY]) {
    const found = await prisma.business.findUnique({ where: { id: b.id }, select: { id: true } });
    if (!found) missing.push(b.id);
  }
  if (missing.length) {
    console.error(
      `These businesses don't exist yet: ${missing.join(", ")}\n` +
        "Run `npm run prisma:seed` first — that file owns the listings, this one only adds activity.",
    );
    process.exit(1);
  }

  // One hash, reused. bcrypt at cost 10 is ~100ms and there are 14 accounts;
  // they all share a password anyway, so 14 distinct salts buy nothing here.
  const hash = await hashPassword(DEMO_PASSWORD);

  // ── Members: L2, verified, on a tier ────────────────────────────────────
  for (const m of MEMBERS) {
    await prisma.business.update({
      where: { id: m.id },
      data: {
        verificationLevel: SSM_VERIFIED,
        ssm: m.ssm,
        // BOTH columns, always — the rule Business.ssmNormalized's own comment
        // states. A third writer that sets `ssm` alone is a business that
        // cannot be found by its own registration number.
        ssmNormalized: normalizeSsm(m.ssm),
        membershipTier: m.tier,
        membershipTierStartedAt: daysAgo(m.claimedDaysAgo),
        isFoundingMember: m.founding,
      },
    });
    await upsertAccount({
      id: `demo-acct-${m.id}`,
      businessId: m.id,
      person: m.person,
      email: m.email,
      phone: m.phone,
      hash,
      claimedDaysAgo: m.claimedDaysAgo,
      method: "domain-auto",
    });
    await upsertEvent({
      id: `demo-ev-claim-${m.id}`,
      type: "business_claimed",
      subjectBusinessId: m.id,
      at: daysAgo(m.claimedDaysAgo),
    });
    await upsertEvent({
      id: `demo-ev-verify-${m.id}`,
      type: "business_verified",
      subjectBusinessId: m.id,
      at: daysAgo(m.verifiedDaysAgo),
    });
  }

  // ── Pending SSM review + claimed-only ───────────────────────────────────
  for (const p of PENDING_SSM) {
    await prisma.business.update({
      where: { id: p.id },
      data: { verificationLevel: CLAIMED, ssm: p.ssm, ssmNormalized: normalizeSsm(p.ssm) },
    });
    await upsertAccount({
      id: `demo-acct-${p.id}`,
      businessId: p.id,
      person: p.person,
      email: p.email,
      phone: p.phone,
      hash,
      claimedDaysAgo: p.claimedDaysAgo,
      method: "manual",
    });
    await upsertEvent({
      id: `demo-ev-claim-${p.id}`,
      type: "business_claimed",
      subjectBusinessId: p.id,
      at: daysAgo(p.claimedDaysAgo),
    });
  }

  for (const c of CLAIMED_ONLY) {
    await prisma.business.update({
      where: { id: c.id },
      data: { verificationLevel: CLAIMED, ssm: null, ssmNormalized: null },
    });
    await upsertAccount({
      id: `demo-acct-${c.id}`,
      businessId: c.id,
      person: c.person,
      email: c.email,
      phone: c.phone,
      hash,
      claimedDaysAgo: c.claimedDaysAgo,
      method: "manual",
    });
    await upsertEvent({
      id: `demo-ev-claim-${c.id}`,
      type: "business_claimed",
      subjectBusinessId: c.id,
      at: daysAgo(c.claimedDaysAgo),
    });
  }

  // ── Vouches ─────────────────────────────────────────────────────────────
  //
  // Three rows each, in the order the schema requires: the Vouch header, the
  // VouchRevision holding the text, then the header pointed at it. The text
  // lives in the revision and NOWHERE else — Vouch has no testimonial column,
  // deliberately, and the feed quotes through this same pointer.
  for (const [from, to, ago, comment] of VOUCHES) {
    const id = `demo-vouch-${from}--${to}`;
    const revisionId = `${id}-r1`;
    const at = daysAgo(ago);
    const header = {
      status: "published",
      attempt: 1,
      revisionCount: 0,
      fromBusinessId: from,
      toBusinessId: to,
      createdAt: at,
      lastActionAt: at,
      closedAt: at,
    };
    await prisma.vouch.upsert({
      where: { id },
      // currentRevisionId is set in the second pass below, not here — the
      // revision row does not exist yet on a first run.
      update: { ...header },
      create: { id, ...header },
    });
    const revision = {
      vouchId: id,
      attempt: 1,
      revisionNumber: 1,
      comment,
      createdById: from,
      createdAt: at,
    };
    await prisma.vouchRevision.upsert({
      where: { id: revisionId },
      update: revision,
      create: { id: revisionId, ...revision },
    });
    await prisma.vouch.update({ where: { id }, data: { currentRevisionId: revisionId } });

    await upsertEvent({
      id: `demo-ev-vouch-${from}--${to}`,
      type: "vouch_published",
      subjectBusinessId: to,
      actorBusinessId: from,
      vouchId: id,
      at,
    });
  }

  // ── Connections ─────────────────────────────────────────────────────────
  //
  // businessAId must be the lexicographically smaller id — the app-layer
  // invariant Connection's own comment describes, without which the @@unique
  // stops catching duplicates. Sorted here rather than hand-ordered above so
  // the table stays readable.
  for (const [x, y, source, ago] of CONNECTIONS) {
    const [a, b] = [x, y].sort();
    const id = `demo-conn-${a}--${b}`;
    const at = daysAgo(ago);
    const data = {
      source,
      status: "accepted",
      requestedById: x,
      businessAId: a,
      businessBId: b,
      createdAt: at,
      respondedAt: at,
    };
    await prisma.connection.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  for (const [follower, followed, ago] of FOLLOWS) {
    const id = `demo-follow-${follower}--${followed}`;
    const data = { followerId: follower, followedId: followed, createdAt: daysAgo(ago) };
    await prisma.follow.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // ── Asks and answers ────────────────────────────────────────────────────
  let answerCount = 0;
  for (const ask of ASKS) {
    const at = daysAgo(ask.daysAgo);
    const accepted = ask.answers.find((a) => a.accepted);
    const header = {
      askedByBusinessId: ask.by,
      category: ask.category,
      matchCategory: ask.matchCategory,
      matchLocation: ask.matchLocation,
      title: ask.title,
      detail: ask.detail,
      status: accepted ? "answered" : "open",
      maxAnswers: 6,
      // 30 days from posting, matching ASK_EXPIRY_DAYS. Computed off the
      // backdated createdAt so the older asks are genuinely closer to expiry
      // rather than all resetting to 30 days out.
      expiresAt: new Date(at.getTime() + 30 * 86_400_000),
      createdAt: at,
    };
    await prisma.ask.upsert({ where: { id: ask.id }, update: header, create: { id: ask.id, ...header } });

    for (const [i, ans] of ask.answers.entries()) {
      const id = `${ask.id}-a${i + 1}`;
      // Staggered a few hours apart so the answer list has a real order
      // rather than every row sharing one timestamp.
      const answeredAt = new Date(at.getTime() + (i + 1) * 7 * 3_600_000);
      const data = {
        askId: ask.id,
        answeredByBusinessId: ans.by,
        recommendedBusinessId: ans.recommends,
        comment: ans.comment,
        status: ans.accepted ? "accepted" : "offered",
        createdAt: answeredAt,
        acceptedAt: ans.accepted ? new Date(answeredAt.getTime() + 26 * 3_600_000) : null,
      };
      await prisma.askAnswer.upsert({ where: { id }, update: data, create: { id, ...data } });
      answerCount += 1;

      if (ans.accepted) {
        await upsertEvent({
          id: `demo-ev-rec-${id}`,
          type: "recommendation_published",
          subjectBusinessId: ans.recommends,
          actorBusinessId: ask.by,
          askAnswerId: id,
          at: data.acceptedAt,
        });
      }
    }
  }

  const events = await prisma.networkEvent.count({ where: { id: { startsWith: "demo-ev-" } } });
  console.log(
    [
      "",
      `  ${MEMBERS.length} verified members (L2) with owner accounts`,
      `  ${PENDING_SSM.length} awaiting SSM review · ${CLAIMED_ONLY.length} claimed, no number yet`,
      `  ${VOUCHES.length} published vouches`,
      `  ${CONNECTIONS.length} connections · ${FOLLOWS.length} follows`,
      `  ${ASKS.length} asks · ${answerCount} answers`,
      `  ${events} feed events`,
      "",
      `  Log in as any owner with: ${DEMO_PASSWORD}`,
      `  e.g. ${MEMBERS[0].email} (pro) · ${MEMBERS[3].email} (plus) · ${MEMBERS[9].email} (free)`,
      "",
    ].join("\n"),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
