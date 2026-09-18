import { PrismaClient } from "@prisma/client";

import { CATEGORY_SERVICES } from "../src/lib/categoryServices.js";
import { UNCLAIMED } from "../src/lib/verificationLevels.js";

const prisma = new PrismaClient();

// Ported from the frontend's data/businesses.js — the same 21 sample
// listings, seeded here as unclaimed (T0) so the claim flow has real rows
// to claim against. Drops the frontend's fake vouchCount/pre-claimed tiers
// (T1/T2 with no real account behind them) since a real database shouldn't
// contain claims or vouches nobody actually made.
const businesses = [
  { id: "meridian-accounting", name: "Meridian Accounting", category: "Accounting & Tax", location: "Petaling Jaya", domain: "meridianaccounting.my", description: "Full-service accounting and tax filing for SMEs, with a focus on fast SSM annual return turnaround.", phone: "03-7955 1234", whatsapp: "60123451234", email: "hello@meridianaccounting.my", website: "https://meridianaccounting.my", address: "Level 8, Menara MPPJ, Jalan Tengah, 46200 Petaling Jaya, Selangor", openingHours: "Mon–Fri 9am–6pm\nSat 9am–1pm\nClosed Sunday and public holidays" },
  { id: "sentul-corp-services", name: "Sentul Corp Services", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "sentulcorpservices.my", description: "Company secretarial services covering incorporation, statutory filings, and compliance advisory.", phone: "03-4045 8820", whatsapp: "60193348820", email: "enquiry@sentulcorpservices.my", website: "https://sentulcorpservices.my", address: "22 Jalan Sentul Pasar, 51000 Kuala Lumpur", openingHours: "Mon–Fri 9am–5.30pm" },
  { id: "bangsar-legal-partners", name: "Bangsar Legal Partners", category: "Law", location: "Bangsar", domain: "bangsarlegalpartners.my", description: "Commercial law firm specialising in contracts, corporate structuring, and dispute resolution.", phone: "03-2287 6611", whatsapp: "60122876611", email: "contact@bangsarlegalpartners.my", website: "https://bangsarlegalpartners.my", address: "Suite 12-3, Bangsar Village II, 59100 Kuala Lumpur", openingHours: "Mon–Fri 9am–6pm, by appointment" },
  { id: "clearpath-corp-sec", name: "Clearpath Corp Sec", category: "Corporate Secretarial", location: "Subang Jaya", domain: "clearpathcorpsec.my", description: "Boutique company secretarial practice serving early-stage and growth-stage businesses." },
  { id: "novatech-consulting", name: "NovaTech Consulting", category: "IT Consulting", location: "Shah Alam", domain: "novatechconsulting.my", description: "IT infrastructure and systems consulting for SMEs migrating to cloud-based operations.", phone: "03-5511 7304", whatsapp: "60167304551", email: "hello@novatechconsulting.my", website: "https://novatechconsulting.my", address: "Unit 5-2, Jalan Kristal, Seksyen 7, 40000 Shah Alam, Selangor", openingHours: "Mon–Fri 9am–6pm" },
  { id: "puchong-tax-advisory", name: "Puchong Tax Advisory", category: "Accounting & Tax", location: "Puchong", domain: "puchongtaxadvisory.my", description: "Tax planning and compliance advisory for owner-managed businesses across the Klang Valley.", phone: "03-8070 2255", whatsapp: "60138702255", email: "admin@puchongtaxadvisory.my", website: "https://puchongtaxadvisory.my", address: "18-1 Jalan Kenari 5, Bandar Puchong Jaya, 47100 Puchong, Selangor", openingHours: "Mon–Fri 9am–6pm\nSat 9am–12.30pm" },
  { id: "kl-secretarial-group", name: "KL Secretarial Group", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "klsecretarialgroup.my", description: "Company secretarial firm listed from public SSM registry data. Not yet claimed by an owner." },
  { id: "damansara-law-chambers", name: "Damansara Law Chambers", category: "Law", location: "Petaling Jaya", domain: "damansaralawchambers.my", description: "Legal practice listed from public registry data. Not yet claimed by an owner." },
  { id: "subang-it-solutions", name: "Subang IT Solutions", category: "IT Consulting", location: "Subang Jaya", domain: "subangitsolutions.my", description: "IT services provider listed from public registry data. Not yet claimed by an owner." },
  { id: "shah-alam-corp-advisors", name: "Shah Alam Corp Advisors", category: "Corporate Secretarial", location: "Shah Alam", domain: "shahalamcorpadvisors.my", description: "Corporate secretarial firm listed from public registry data. Not yet claimed by an owner." },
  { id: "cheras-accounting-hub", name: "Cheras Accounting Hub", category: "Accounting & Tax", location: "Kuala Lumpur", domain: "cherasaccountinghub.my", description: "Accounting practice listed from public registry data. Not yet claimed by an owner." },
  { id: "gombak-secretarial-services", name: "Gombak Secretarial Services", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "gombaksecretarialservices.my", description: "Company secretarial firm listed from public registry data. Not yet claimed by an owner." },
  { id: "usj-corp-sec-partners", name: "USJ Corp Sec Partners", category: "Corporate Secretarial", location: "Subang Jaya", domain: "usjcorpsecpartners.my", description: "Company secretarial services for SMEs in the USJ and Subang commercial corridor." },
  { id: "kelana-jaya-law-associates", name: "Kelana Jaya Law Associates", category: "Law", location: "Petaling Jaya", domain: "kelanajayalawassociates.my", description: "Legal practice listed from public registry data. Not yet claimed by an owner." },
  { id: "mont-kiara-accounting-co", name: "Mont Kiara Accounting Co", category: "Accounting & Tax", location: "Kuala Lumpur", domain: "montkiaraaccountingco.my", description: "Accounting practice listed from public registry data. Not yet claimed by an owner." },
  { id: "brickfields-corp-services", name: "Brickfields Corp Services", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "brickfieldscorpservices.my", description: "Company secretarial and compliance firm serving professional-services clients across KL.", phone: "03-2274 9018", whatsapp: "60172749018", email: "cosec@brickfieldscorpservices.my", website: "https://brickfieldscorpservices.my", address: "3rd Floor, 88 Jalan Tun Sambanthan, Brickfields, 50470 Kuala Lumpur", openingHours: "Mon–Fri 9am–5.30pm" },
  { id: "klang-it-partners", name: "Klang IT Partners", category: "IT Consulting", location: "Shah Alam", domain: "klangitpartners.my", description: "IT consulting firm listed from public registry data. Not yet claimed by an owner." },
  { id: "ttdi-corp-sec-studio", name: "TTDI Corp Sec Studio", category: "Corporate Secretarial", location: "Kuala Lumpur", domain: "ttdicorpsecstudio.my", description: "Company secretarial studio supporting startups and SMEs through incorporation and compliance." },
  { id: "sunway-legal-group", name: "Sunway Legal Group", category: "Law", location: "Subang Jaya", domain: "sunwaylegalgroup.my", description: "Commercial and corporate law practice serving the Sunway and Subang business corridor." },
  { id: "puchong-corp-sec-hub", name: "Puchong Corp Sec Hub", category: "Corporate Secretarial", location: "Puchong", domain: "puchongcorpsechub.my", description: "Company secretarial firm listed from public registry data. Not yet claimed by an owner." },
  { id: "bangsar-south-accounting", name: "Bangsar South Accounting", category: "Accounting & Tax", location: "Kuala Lumpur", domain: "bangsarsouthaccounting.my", description: "Accounting and tax advisory firm with a client base of professional-services SMEs." },
  { id: "petaling-jaya-corp-registry", name: "Petaling Jaya Corp Registry", category: "Corporate Secretarial", location: "Petaling Jaya", domain: "petalingjayacorpregistry.my", description: "Company secretarial firm listed from public registry data. Not yet claimed by an owner." },

  // ── The everyday SMEs ───────────────────────────────────────────────────
  //
  // THE OTHER HALF OF THE NETWORK. The 22 above all SELL professional
  // services, which made every seeded ask read "professional-services firm
  // needs professional-services firm" — the most common real transaction in
  // the corridor, a bakery needing an accountant, could not be seeded because
  // neither the category nor the business existed.
  //
  // These are the buyers. They are what makes the directory legible at a
  // glance: a reader scanning a board of asks can tell a kopitiam chain from a
  // furniture maker instantly, and could not tell two company secretaries
  // apart at all.
  { id: "roti-sawan-bakery", name: "Roti Sawan Bakery", category: "Food & Beverage", location: "Petaling Jaya", domain: "rotisawan.my", description: "Neighbourhood bakery running four outlets across PJ and Subang, with a central kitchen supplying cafes and offices.", phone: "03-7877 4412", whatsapp: "60127877441", email: "hello@rotisawan.my", website: "https://rotisawan.my", address: "12 Jalan SS2/24, 47300 Petaling Jaya, Selangor", openingHours: "Mon–Sat 7am–7pm\nSun 7am–2pm" },
  { id: "kopi-lengkap-group", name: "Kopi Lengkap Group", category: "Food & Beverage", location: "Kuala Lumpur", domain: "kopilengkap.my", description: "Kopitiam chain with nine outlets in the Klang Valley and a growing corporate catering arm.", phone: "03-2141 9080", whatsapp: "60321419080", email: "admin@kopilengkap.my", website: "https://kopilengkap.my", address: "Lot 3-11, Jalan Sultan Ismail, 50250 Kuala Lumpur", openingHours: "Daily 7am–10pm" },
  { id: "hartaco-furniture", name: "Hartaco Furniture", category: "Manufacturing", location: "Shah Alam", domain: "hartaco.my", description: "Contract furniture maker producing office and hospitality fit-outs for developers and interior firms.", phone: "03-5122 8867", whatsapp: "60351228867", email: "sales@hartaco.my", website: "https://hartaco.my", address: "Lot 8, Jalan Utas 15/7, Seksyen 15, 40200 Shah Alam, Selangor", openingHours: "Mon–Fri 8.30am–6pm\nSat 8.30am–1pm" },
  { id: "cetak-murni-press", name: "Cetak Murni Press", category: "Manufacturing", location: "Puchong", domain: "cetakmurni.my", description: "Commercial printer handling packaging, corporate collateral and short-run label work.", phone: "03-8060 3321", whatsapp: "60380603321", email: "print@cetakmurni.my", website: "https://cetakmurni.my", address: "23 Jalan Puteri 4/6, Bandar Puteri, 47100 Puchong, Selangor", openingHours: "Mon–Fri 9am–6pm" },
  { id: "seri-murni-catering", name: "Seri Murni Catering", category: "Food & Beverage", location: "Ampang", domain: "serimurni.my", description: "Event and corporate caterer serving offices, weddings and government functions across the Klang Valley." },
  { id: "laju-logistics", name: "Laju Logistics", category: "Logistics", location: "Shah Alam", domain: "lajulogistics.my", description: "Last-mile and B2B delivery operator with a 40-vehicle fleet and two Klang Valley warehouses.", phone: "03-5510 7788", whatsapp: "60355107788", email: "ops@lajulogistics.my", website: "https://lajulogistics.my", address: "Warehouse 4, Jalan Pelabur 23/1, Seksyen 23, 40300 Shah Alam, Selangor", openingHours: "Mon–Sat 8am–8pm" },
  { id: "taman-desa-dental", name: "Taman Desa Dental", category: "Health & Wellness", location: "Kuala Lumpur", domain: "tamandesadental.my", description: "Two-surgery dental practice with a corporate panel arrangement for nearby offices." },
  { id: "brightpath-tuition", name: "Brightpath Learning Centre", category: "Education", location: "Subang Jaya", domain: "brightpath.my", description: "Enrichment and tuition centre running three branches, expanding into corporate language training." },
  { id: "kiara-aircond-services", name: "Kiara Aircond Services", category: "Construction & Trades", location: "Kuala Lumpur", domain: "kiaraaircond.my", description: "Air-conditioning installation and maintenance contractor working mainly on commercial maintenance contracts." },
  { id: "sinar-retail-supply", name: "Sinar Retail Supply", category: "Retail", location: "Petaling Jaya", domain: "sinarretail.my", description: "Wholesale supplier of packaging, disposables and consumables to F&B and retail operators." },
  { id: "anggun-events", name: "Anggun Events", category: "Marketing & Media", location: "Bangsar", domain: "anggunevents.my", description: "Event management and brand activation agency working with F&B and retail brands." },
  { id: "lembah-property-management", name: "Lembah Property Management", category: "Property", location: "Petaling Jaya", domain: "lembahproperty.my", description: "Manages commercial and mixed-use buildings across PJ and Subang, listed from public registry data. Not yet claimed by an owner." },
];

// Only some rows above carry contact details, on purpose: the gate in
// lib/contactVisibility.js is only testable if the directory holds both
// businesses that have contact details to withhold and businesses that
// genuinely have none. "Withheld" and "empty" are different states and must
// not be demonstrable only in theory.
//
// Deliberately NOT seeded: membershipTier and its dates. Every row here
// stays on the default free tier, so a fresh database shows the LOCKED side
// of the gate by default; scripts/set-membership-tier.js is the only mover of tiers and
// is how you get a row to the unlocked side.
const CONTACT_COLUMNS = ["phone", "whatsapp", "email", "website", "address", "openingHours"];

function contactFieldsOf(b) {
  return Object.fromEntries(
    CONTACT_COLUMNS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]),
  );
}

async function main() {
  for (const b of businesses) {
    const contact = contactFieldsOf(b);
    await prisma.business.upsert({
      where: { id: b.id },
      // Contact columns ONLY. This used to be `update: {}` — non-destructive
      // by design, because a re-run must never reset the verification level or membership tier of a
      // business somebody has since claimed. That's still true, and it's why
      // this isn't widened to the whole row. But `{}` also meant a column
      // added AFTER the first seed run could never land on the 21 existing
      // rows, so the contact fields would only ever appear on a database
      // built from scratch.
      //
      // Be clear about the cost: on the six seeded rows this DOES overwrite
      // whatever an owner last saved through PATCH /businesses/me. That's
      // acceptable for a dev seed on sample listings — resetting them to a
      // known state is usually the reason you re-ran it — but it is the
      // reason not to add a real member's business to the list above.
      update: contact,
      create: {
        id: b.id,
        name: b.name,
        category: b.category,
        location: b.location,
        domain: b.domain,
        description: b.description,
        services: CATEGORY_SERVICES[b.category] ?? [],
        verificationLevel: UNCLAIMED,
        ...contact,
      },
    });
  }
  const withContact = businesses.filter((b) => Object.keys(contactFieldsOf(b)).length > 0).length;
  console.log(
    `Seeded ${businesses.length} unclaimed (T0) businesses, ${withContact} with contact details.`,
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
