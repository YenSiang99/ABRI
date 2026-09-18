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
// answers nobody gave. On a real database that is fabricated trust evidence,
// which is the one thing this product cannot contain. The guard at
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
const { PROJECT_INCLUDE, engagementRowsFor } = await import("../src/lib/projects.js");

const DEMO_PASSWORD = "Demo1234!";

const now = Date.now();
const daysAgo = (n, hour = 10) => new Date(now - n * 86_400_000 + hour * 3_600_000);
// First of the month, UTC — the precision Project.startedOn/completedOn and
// Engagement.occurredOn all store, and the same flooring routes/projects.js
// applies. Seeding a day-level date here would put demo rows in a shape the
// product itself cannot produce.
const monthFloor = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

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

  // ── The everyday SMEs ───────────────────────────────────────────────────
  //
  // The buyers, and the reason the board below is readable. The ten above all
  // sell professional services to each other, which made every seeded ask read
  // "one firm you cannot picture needs another firm you cannot picture". A
  // bakery needing an accountant is the transaction this network actually
  // exists to carry, and until these rows existed it could not be seeded.
  //
  // They are L2 for a plain reason rather than a flattering one: posting an
  // ask requires SSM verification (canPostAsks), so an unverified bakery is a
  // bakery whose ask cannot appear on the board at all.
  {
    id: "roti-sawan-bakery",
    person: "Siti Nadiah binti Osman",
    email: "nadiah@rotisawan.my",
    phone: "60127877441",
    ssm: "201503018877",
    tier: "plus",
    founding: false,
    claimedDaysAgo: 58,
    verifiedDaysAgo: 54,
  },
  {
    id: "kopi-lengkap-group",
    person: "Chong Kar Wai",
    email: "karwai@kopilengkap.my",
    phone: "60321419080",
    ssm: "201201009336",
    tier: "pro",
    founding: false,
    claimedDaysAgo: 51,
    verifiedDaysAgo: 46,
  },
  {
    id: "hartaco-furniture",
    person: "Rajesh Kumar Subramaniam",
    email: "rajesh@hartaco.my",
    phone: "60351228867",
    ssm: "200601014028",
    tier: "plus",
    founding: false,
    claimedDaysAgo: 44,
    verifiedDaysAgo: 40,
  },
  {
    id: "laju-logistics",
    person: "Mohd Hafiz bin Zulkifli",
    email: "hafiz@lajulogistics.my",
    phone: "60355107788",
    ssm: "201704021150",
    tier: "free",
    founding: false,
    claimedDaysAgo: 37,
    verifiedDaysAgo: 33,
  },
  {
    id: "cetak-murni-press",
    person: "Goh Mei Yee",
    email: "meiyee@cetakmurni.my",
    phone: "60380603321",
    ssm: "201905012264",
    tier: "free",
    founding: false,
    claimedDaysAgo: 29,
    verifiedDaysAgo: 24,
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
// answer, which settles them — accepting publishes nothing anywhere, so these
// exist to give the board a realistic mix of open and settled threads rather
// than to seed anything on a profile.
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

  // ── The everyday SMEs asking ────────────────────────────────────────────
  //
  // PLAIN ON PURPOSE. The seven above are accurate and unreadable at a glance:
  // "Company secretary for a three-entity group restructuring" is what the ask
  // really says, and a person scanning the board cannot tell it apart from the
  // next one without reading both. These say who is asking and what they need
  // in the title — a bakery needs an accountant — which is what makes the
  // board scannable rather than merely correct.
  //
  // It is also the honest shape of the demand side: an SME does not describe
  // its problem in the supplier's vocabulary, and an asks board that only
  // accepts the supplier's vocabulary is one SMEs will not post to.
  {
    id: "demo-ask-bakery-accountant",
    by: "roti-sawan-bakery",
    category: "Service requirement",
    matchCategory: "Accounting & Tax",
    matchLocation: "Petaling Jaya",
    title: "Bakery with four outlets needs an accountant",
    detail:
      "We've outgrown doing the books ourselves. Four shops plus a central kitchen, about 30 staff, and we're behind on two years of filings. Need someone who has dealt with F&B — the stock and wastage side is where our last accountant got lost.",
    daysAgo: 23,
    answers: [
      { by: "meridian-accounting", recommends: "meridian-accounting", accepted: true, comment: "We do the books for two restaurant groups and a central kitchen, so the wastage and stock questions are familiar. First thing is getting the two years of filings clean — we can quote that separately from the monthly work so you know what the catch-up costs." },
      { by: "puchong-tax-advisory", recommends: "puchong-tax-advisory", comment: "Happy to take this on. We'd start with the outstanding filings before touching the monthly process, otherwise you're building on a mess." },
      { by: "sentul-corp-services", recommends: "bangsar-south-accounting", comment: "Not our line, but Danial's team handles a few F&B clients and is good at the catch-up work." },
    ],
  },
  {
    id: "demo-ask-kopitiam-lawyer",
    by: "kopi-lengkap-group",
    category: "Service requirement",
    matchCategory: "Law",
    matchLocation: "Kuala Lumpur",
    title: "Need a lawyer to look at our franchise agreement",
    detail:
      "Two people have asked to open outlets under our name and we don't have a franchise agreement — just a one-page letter our previous shop used. Want it done properly before we say yes to anyone.",
    daysAgo: 16,
    answers: [
      { by: "bangsar-legal-partners", recommends: "bangsar-legal-partners", comment: "This is work we do regularly. The registration requirements under the Franchise Act catch most F&B operators out — worth understanding what you're committing to before the agreement is drafted, not after." },
      { by: "sunway-legal-group", recommends: "sunway-legal-group", comment: "We've drafted three of these for F&B groups. Can share the structure we usually start from." },
    ],
  },
  {
    id: "demo-ask-furniture-delivery",
    by: "hartaco-furniture",
    category: "Supplier requirement",
    matchCategory: "Logistics",
    matchLocation: "Shah Alam",
    title: "Furniture maker looking for a delivery partner",
    detail:
      "Roughly 40 deliveries a week around the Klang Valley, mostly bulky office furniture that needs two people and sometimes a lift booking. Our current arrangement is three lorry owners we call individually and it is falling apart.",
    daysAgo: 12,
    answers: [
      { by: "laju-logistics", recommends: "laju-logistics", accepted: true, comment: "We run two-person crews for exactly this kind of load and can hold a fixed weekly slot. The lift bookings we handle ourselves — it's the part that causes most failed deliveries and it isn't really a transport problem." },
    ],
  },
  {
    id: "demo-ask-printer-cosec",
    by: "cetak-murni-press",
    category: "Service requirement",
    matchCategory: "Corporate Secretarial",
    matchLocation: "Puchong",
    title: "Adding a business partner — need a company secretary",
    detail:
      "Bringing in someone who has been running the sales side for three years and wants equity. No idea what paperwork this actually needs. Looking for someone who will explain it in plain terms.",
    daysAgo: 6,
    answers: [
      { by: "puchong-corp-sec-hub", recommends: "puchong-corp-sec-hub", comment: "Straightforward share allotment plus a shareholders agreement. We'd walk you through what each document does before anything is signed — it is not as complicated as it looks from outside." },
      { by: "meridian-accounting", recommends: "usj-corp-sec-partners", comment: "Grace's team did this for a client of ours and were patient about explaining it. Worth a call." },
    ],
  },
  {
    id: "demo-ask-logistics-aircond",
    by: "laju-logistics",
    category: "Supplier requirement",
    matchCategory: "Construction & Trades",
    matchLocation: "Shah Alam",
    title: "Warehouse aircond servicing contract",
    detail:
      "Two warehouses, twelve units between them, currently serviced whenever someone remembers. Want a proper maintenance contract with scheduled visits.",
    daysAgo: 3,
    answers: [],
  },
];

// ── Projects, and the work record they mint ───────────────────────────────
//
// WITHOUT THESE, three screens are correct and look broken: /app/projects says
// nobody is working with anybody, the "Worked with" panel on every profile is
// empty, and the services a member claims all render as unbacked dashes — the
// exact failure this whole file exists to prevent.
//
// THE COMPLETED ONES MINT, and they mint through the same function the route
// does rather than through hand-written engagement rows. That is the point: if
// engagementRowsFor ever changes what completion produces, this demo changes
// with it, and a demo that can drift from the product is a demo that will.
//
// `provides` is per participant and is theirs — it is what they would have
// declared at join. A pair where BOTH provide something mints two engagements,
// which is why "Kopi Lengkap fit-out" produces more rows than it has people.
const PROJECTS = [
  {
    id: "demo-proj-bakery-books",
    title: "Getting Roti Sawan's books current",
    detail:
      "Two years of filings to catch up, then a monthly process the team can actually keep to. Split between the catch-up work and setting up the stock reporting.",
    by: "roti-sawan-bakery",
    askId: "demo-ask-bakery-accountant",
    visibility: "public",
    startedDaysAgo: 22,
    completedDaysAgo: 4,
    participants: [
      { id: "roti-sawan-bakery", provides: null },
      { id: "meridian-accounting", provides: "Bookkeeping" },
    ],
    updates: [
      { by: "meridian-accounting", daysAgo: 20, body: "Got the box of receipts. FY24 is more complete than expected — starting there and working forward." },
      { by: "roti-sawan-bakery", daysAgo: 14, body: "Central kitchen stock sheets are in the shared folder now. Sorry about the delay, two of the outlets were still on paper." },
      { by: "meridian-accounting", daysAgo: 7, body: "FY24 and FY25 both filed. Moving to the monthly process — first pack goes out at the end of this month." },
    ],
  },
  {
    id: "demo-proj-kopi-fitout",
    title: "Kopi Lengkap Bangsar outlet fit-out",
    detail:
      "New 60-seat outlet. Furniture, the launch campaign and the signage print all running to the same opening date.",
    by: "kopi-lengkap-group",
    visibility: "public",
    startedDaysAgo: 96,
    completedDaysAgo: 33,
    participants: [
      { id: "kopi-lengkap-group", provides: null },
      { id: "hartaco-furniture", provides: "Furniture making" },
      { id: "anggun-events", provides: null },
      { id: "cetak-murni-press", provides: "Packaging & labelling" },
    ],
    updates: [
      { by: "kopi-lengkap-group", daysAgo: 94, body: "Handover from the landlord is confirmed for the 14th. Everything keys off that date." },
      { by: "hartaco-furniture", daysAgo: 72, body: "Counter and booth seating are in production. Tabletops need a finish decision by Friday or we lose the slot." },
      { by: "kopi-lengkap-group", daysAgo: 70, body: "Going with the darker oak. Confirmed with the designer." },
      { by: "cetak-murni-press", daysAgo: 48, body: "Menu boards and window vinyl delivered to site." },
      { by: "hartaco-furniture", daysAgo: 40, body: "Install done. Two stools were short-shipped, replacements sent direct to the outlet." },
    ],
  },
  {
    id: "demo-proj-furniture-delivery",
    title: "Weekly delivery route for Hartaco",
    detail:
      "Replacing three ad-hoc lorry arrangements with one fixed weekly slot, including lift bookings for the office deliveries.",
    by: "hartaco-furniture",
    askId: "demo-ask-furniture-delivery",
    visibility: "private",
    startedDaysAgo: 11,
    completedDaysAgo: null,
    participants: [
      { id: "hartaco-furniture", provides: null },
      { id: "laju-logistics", provides: "Last-mile delivery" },
    ],
    updates: [
      { by: "laju-logistics", daysAgo: 10, body: "Ran the first Tuesday route. 14 drops, one failed on a lift booking we'll take over from next week." },
      { by: "hartaco-furniture", daysAgo: 4, body: "Second week was clean. Happy to make this the standing arrangement." },
    ],
  },
  {
    id: "demo-proj-restructure",
    title: "Three-entity group restructuring",
    detail:
      "Collapsing three operating companies into one holding structure ahead of a funding round. Cosec leads the sequencing, tax on the transfer treatment, legal on the shareholder side.",
    by: "meridian-accounting",
    askId: "demo-ask-restructure-cosec",
    visibility: "public",
    startedDaysAgo: 25,
    completedDaysAgo: 2,
    participants: [
      { id: "meridian-accounting", provides: "Tax advisory" },
      { id: "usj-corp-sec-partners", provides: "Corporate structuring" },
      { id: "bangsar-legal-partners", provides: "Shareholder agreements" },
    ],
    updates: [
      { by: "usj-corp-sec-partners", daysAgo: 24, body: "Draft sequencing circulated. The order the two dormant entities are wound matters for the transfer treatment — flagging for tax before anything is filed." },
      { by: "meridian-accounting", daysAgo: 18, body: "Confirmed. If the dormant pair go first the transfer is clean; the other way round it is not. Sequencing as drafted." },
      { by: "bangsar-legal-partners", daysAgo: 9, body: "Shareholders agreement executed. Nothing outstanding from our side." },
    ],
  },
  {
    id: "demo-proj-practice-cloud",
    title: "Moving Bangsar Legal off the file server",
    detail:
      "On-premise to cloud for a 40-seat practice, with privilege obligations on where the data sits and who holds the keys.",
    by: "bangsar-legal-partners",
    askId: "demo-ask-cloud-migration",
    visibility: "private",
    startedDaysAgo: 13,
    completedDaysAgo: null,
    participants: [
      { id: "bangsar-legal-partners", provides: null },
      { id: "novatech-consulting", provides: "Cloud migration" },
    ],
    updates: [
      { by: "novatech-consulting", daysAgo: 12, body: "Scoping done. Recommending a tenancy in the Singapore region with customer-managed keys — happy to put the reasoning in writing for your risk file." },
    ],
  },
  // An INVITE that has not been answered, so /app/projects has something in
  // its Invites tab and the Inbox badge has something to count.
  {
    id: "demo-proj-catering-books",
    title: "Seri Murni — monthly bookkeeping",
    detail: "Taking over the monthly books from April, plus the SST position on event catering.",
    by: "bangsar-south-accounting",
    visibility: "private",
    startedDaysAgo: 2,
    completedDaysAgo: null,
    participants: [
      { id: "bangsar-south-accounting", provides: "Bookkeeping" },
      { id: "kopi-lengkap-group", provides: null, invitedOnly: true },
    ],
    updates: [],
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
// NO askAnswerId. It was a column here until Sept 2026, carrying the
// `recommendation_published` event that put an accepted answer on the named
// business's profile; the feature and the column went together (see the
// NetworkEvent comment in schema.prisma). This script kept passing it and has
// been failing on every run since — the argument simply does not exist any
// more, and Prisma rejects the whole upsert rather than ignoring it.
async function upsertEvent({ id, type, subjectBusinessId, actorBusinessId = null, vouchId = null, at }) {
  const data = {
    type,
    subjectBusinessId,
    actorBusinessId,
    vouchId,
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
        "This writes published vouches and accepted answers that nobody made.\n" +
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
    }
  }

  // ── Projects, participants, timeline, and the mint ──────────────────────
  let mintedTotal = 0;
  for (const p of PROJECTS) {
    const startedOn = monthFloor(daysAgo(p.startedDaysAgo));
    const completed = p.completedDaysAgo !== null && p.completedDaysAgo !== undefined;
    const completedAt = completed ? daysAgo(p.completedDaysAgo) : null;
    const header = {
      title: p.title,
      detail: p.detail ?? null,
      createdById: p.by,
      status: completed ? "completed" : "active",
      visibility: p.visibility,
      askId: p.askId ?? null,
      startedOn,
      completedOn: completed ? monthFloor(completedAt) : null,
      createdAt: daysAgo(p.startedDaysAgo),
      lastActionAt: completedAt ?? daysAgo(p.startedDaysAgo),
      completedAt,
      cancelledAt: null,
    };
    await prisma.project.upsert({ where: { id: p.id }, update: header, create: { id: p.id, ...header } });

    for (const part of p.participants) {
      const id = `${p.id}--${part.id}`;
      const invited = Boolean(part.invitedOnly);
      const data = {
        projectId: p.id,
        businessId: part.id,
        // The creator joins their own project outright; everyone else was
        // invited by them. Same shape POST /projects writes.
        invitedById: p.by,
        status: invited ? "invited" : "joined",
        serviceProvided: part.provides ?? null,
        invitedAt: daysAgo(p.startedDaysAgo),
        joinedAt: invited ? null : daysAgo(p.startedDaysAgo - 1),
        leftAt: null,
      };
      await prisma.projectParticipant.upsert({ where: { id }, update: data, create: { id, ...data } });
    }

    // The timeline, system rows included, so it reads the way a real one does
    // rather than as a run of messages with no beginning.
    const rows = [
      { kind: "created", by: p.by, at: daysAgo(p.startedDaysAgo), body: null },
      ...p.participants
        .filter((part) => part.id !== p.by && !part.invitedOnly)
        .map((part) => ({ kind: "joined", by: part.id, at: daysAgo(p.startedDaysAgo - 1), body: null })),
      ...(p.updates ?? []).map((u) => ({ kind: "update", by: u.by, at: daysAgo(u.daysAgo), body: u.body })),
      ...(completed ? [{ kind: "completed", by: p.by, at: completedAt, body: null }] : []),
    ].sort((a, b) => a.at - b.at);

    for (const [i, row] of rows.entries()) {
      const id = `${p.id}-u${String(i + 1).padStart(2, "0")}`;
      const data = {
        projectId: p.id,
        authorBusinessId: row.by,
        type: row.kind,
        body: row.body,
        createdAt: row.at,
      };
      await prisma.projectUpdate.upsert({ where: { id }, update: data, create: { id, ...data } });
    }

    if (!completed) continue;

    // THE MINT, through lib/projects.js rather than by hand. Writing the
    // engagement rows here would be a second implementation of the rule that
    // decides what a completed project produces, and the two would drift the
    // first time either changed — with the demo being the one nobody notices
    // is wrong. Deterministic ids so this stays idempotent, which createMany
    // inside mintEngagementsFor cannot be.
    const loaded = await prisma.project.findUnique({
      where: { id: p.id },
      include: PROJECT_INCLUDE,
    });
    const rowsToMint = engagementRowsFor(loaded, completedAt);
    for (const [i, row] of rowsToMint.entries()) {
      const id = `${p.id}-e${String(i + 1).padStart(2, "0")}`;
      await prisma.engagement.upsert({ where: { id }, update: row, create: { id, ...row } });
      mintedTotal += 1;
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
      `  ${PROJECTS.length} projects · ${mintedTotal} confirmed engagements minted`,
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
