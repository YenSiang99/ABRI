import { PrismaClient } from "@prisma/client";

import { CATEGORY_SERVICES } from "../src/lib/categoryServices.js";

const prisma = new PrismaClient();

// Ported from the frontend's data/businesses.js — the same 21 sample
// listings, seeded here as unclaimed (T0) so the claim flow has real rows
// to claim against. Drops the frontend's fake vouchCount/pre-claimed tiers
// (T1/T2 with no real account behind them) since a real database shouldn't
// contain claims or vouches nobody actually made.
const businesses = [
  { id: "meridian-accounting", name: "Meridian Accounting", category: "Accounting & Tax", location: "Petaling Jaya", domain: "meridianaccounting.my", description: "Full-service accounting and tax filing for SMEs, with a focus on fast SSM annual return turnaround." },
  { id: "sentul-corp-services", name: "Sentul Corp Services", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "sentulcorpservices.my", description: "Company secretarial services covering incorporation, statutory filings, and compliance advisory." },
  { id: "bangsar-legal-partners", name: "Bangsar Legal Partners", category: "Law", location: "Bangsar", domain: "bangsarlegalpartners.my", description: "Commercial law firm specialising in contracts, corporate structuring, and dispute resolution." },
  { id: "clearpath-corp-sec", name: "Clearpath Corp Sec", category: "Corporate Secretarial", location: "Subang Jaya", domain: "clearpathcorpsec.my", description: "Boutique company secretarial practice serving early-stage and growth-stage businesses." },
  { id: "novatech-consulting", name: "NovaTech Consulting", category: "IT Consulting", location: "Shah Alam", domain: "novatechconsulting.my", description: "IT infrastructure and systems consulting for SMEs migrating to cloud-based operations." },
  { id: "puchong-tax-advisory", name: "Puchong Tax Advisory", category: "Accounting & Tax", location: "Puchong", domain: "puchongtaxadvisory.my", description: "Tax planning and compliance advisory for owner-managed businesses across the Klang Valley." },
  { id: "kl-secretarial-group", name: "KL Secretarial Group", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "klsecretarialgroup.my", description: "Company secretarial firm listed from public SSM registry data. Not yet claimed by an owner." },
  { id: "damansara-law-chambers", name: "Damansara Law Chambers", category: "Law", location: "Petaling Jaya", domain: "damansaralawchambers.my", description: "Legal practice listed from public registry data. Not yet claimed by an owner." },
  { id: "subang-it-solutions", name: "Subang IT Solutions", category: "IT Consulting", location: "Subang Jaya", domain: "subangitsolutions.my", description: "IT services provider listed from public registry data. Not yet claimed by an owner." },
  { id: "shah-alam-corp-advisors", name: "Shah Alam Corp Advisors", category: "Corporate Secretarial", location: "Shah Alam", domain: "shahalamcorpadvisors.my", description: "Corporate secretarial firm listed from public registry data. Not yet claimed by an owner." },
  { id: "cheras-accounting-hub", name: "Cheras Accounting Hub", category: "Accounting & Tax", location: "Kuala Lumpur", domain: "cherasaccountinghub.my", description: "Accounting practice listed from public registry data. Not yet claimed by an owner." },
  { id: "gombak-secretarial-services", name: "Gombak Secretarial Services", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "gombaksecretarialservices.my", description: "Company secretarial firm listed from public registry data. Not yet claimed by an owner." },
  { id: "usj-corp-sec-partners", name: "USJ Corp Sec Partners", category: "Corporate Secretarial", location: "Subang Jaya", domain: "usjcorpsecpartners.my", description: "Company secretarial services for SMEs in the USJ and Subang commercial corridor." },
  { id: "kelana-jaya-law-associates", name: "Kelana Jaya Law Associates", category: "Law", location: "Petaling Jaya", domain: "kelanajayalawassociates.my", description: "Legal practice listed from public registry data. Not yet claimed by an owner." },
  { id: "mont-kiara-accounting-co", name: "Mont Kiara Accounting Co", category: "Accounting & Tax", location: "Kuala Lumpur", domain: "montkiaraaccountingco.my", description: "Accounting practice listed from public registry data. Not yet claimed by an owner." },
  { id: "brickfields-corp-services", name: "Brickfields Corp Services", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "brickfieldscorpservices.my", description: "Company secretarial and compliance firm serving professional-services clients across KL." },
  { id: "klang-it-partners", name: "Klang IT Partners", category: "IT Consulting", location: "Shah Alam", domain: "klangitpartners.my", description: "IT consulting firm listed from public registry data. Not yet claimed by an owner." },
  { id: "ttdi-corp-sec-studio", name: "TTDI Corp Sec Studio", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "ttdicorpsecstudio.my", description: "Company secretarial studio supporting startups and SMEs through incorporation and compliance." },
  { id: "sunway-legal-group", name: "Sunway Legal Group", category: "Law", location: "Subang Jaya", domain: "sunwaylegalgroup.my", description: "Commercial and corporate law practice serving the Sunway and Subang business corridor." },
  { id: "puchong-corp-sec-hub", name: "Puchong Corp Sec Hub", category: "Corporate Secretarial", location: "Puchong", domain: "puchongcorpsechub.my", description: "Company secretarial firm listed from public registry data. Not yet claimed by an owner." },
  { id: "bangsar-south-accounting", name: "Bangsar South Accounting", category: "Accounting & Tax", location: "Kuala Lumpur", domain: "bangsarsouthaccounting.my", description: "Accounting and tax advisory firm with a client base of professional-services SMEs." },
  { id: "petaling-jaya-corp-registry", name: "Petaling Jaya Corp Registry", category: "Corporate Secretarial", location: "Petaling Jaya", domain: "petalingjayacorpregistry.my", description: "Company secretarial firm listed from public registry data. Not yet claimed by an owner." },
];

async function main() {
  for (const b of businesses) {
    await prisma.business.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        name: b.name,
        category: b.category,
        location: b.location,
        domain: b.domain,
        description: b.description,
        services: CATEGORY_SERVICES[b.category] ?? [],
        tier: "T0",
      },
    });
  }
  console.log(`Seeded ${businesses.length} unclaimed (T0) businesses.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
