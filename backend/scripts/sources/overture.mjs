// Maps Overture Maps places in the Klang Valley onto the intake sheet.
// Run overture_fetch.py first; see its header.
//
//   node scripts/sources/overture.mjs [--min-confidence 0.6]
//
// WHY OVERTURE. It is the bulk source that reaches the professional services
// OSM barely maps — about 1,000 law firms, 450 accountants and 1,700 IT firms
// in the Klang Valley against OSM's ~20 each — and its licence
// (CDLA-Permissive-2.0) allows commercial reuse without share-alike. Most
// rows come from Meta's business pages, which is also why it needs the
// confidence filter below: an abandoned Facebook page is still a "place".
//
// What it does NOT take, per common.mjs: `domain`. Phones, emails and a
// wa.me WhatsApp link are copied when Overture has them (since 3 Oct 2026).
// Websites go to `website` only.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  outDir, blankListing, locationFromPostcode, rejectReasons, assignIds,
  writeOutputs, nameVerdict, nameLog, point,
} from "./common.mjs";
import { isValidLocation } from "../../src/lib/businessVocab.js";

const DIR = outDir("overture");
const argIdx = process.argv.indexOf("--min-confidence");
// Overture's confidence mostly tracks how alive a place's upstream page is,
// and for a restaurant that is a fair proxy: 0.6 drops the long tail of
// one-post Facebook pages. For a B2B firm it is not — a law firm's page gets
// almost no engagement and still exists. Sampled 0.4–0.6 accountants, law
// firms and agencies were overwhelmingly real (named partners, own domain,
// full address), so business-to-business categories use a lower floor.
const MIN_CONFIDENCE = argIdx > -1 ? Number(process.argv[argIdx + 1]) : 0.6;
const B2B_MIN_CONFIDENCE = Math.min(MIN_CONFIDENCE, 0.4);
const B2B = new Set([
  "Corporate Secretarial", "Accounting & Tax", "Law", "IT Consulting",
  "Design", "Marketing & Media", "Property", "Logistics", "Manufacturing",
  "Construction & Trades", "Professional Training", "Automotive",
  "Business Services", "Wholesale & Distribution", "Finance & Insurance",
]);

// ── Category ──────────────────────────────────────────────────────────────
//
// Checked in order: the place's own category, then each ancestor in its
// taxonomy path from most to least specific. The first hit wins, so a
// specific override (interior_design → Design) beats its branch
// (home_service → Construction & Trades). null → overflow.

const SKIP = Symbol("not a business");

const BY_CATEGORY = {
  // Law
  attorney_or_law_firm: "Law", legal_service: "Law",
  // Accounting & Tax, Corporate Secretarial
  accountant: "Accounting & Tax",
  b2b_secretarial_service: "Corporate Secretarial",
  // IT Consulting
  software_development: "IT Consulting",
  it_service_and_computer_repair: "IT Consulting",
  information_technology_company: "IT Consulting",
  computer_hardware_company: "IT Consulting",
  b2b_science_and_technology_service: "IT Consulting",
  automation_service: "IT Consulting",
  // Design
  architectural_designer: "Design", architect: "Design",
  landscape_architect: "Design", interior_design: "Design",
  graphic_designer: "Design", web_designer: "Design",
  // Marketing & Media
  advertising_agency: "Marketing & Media", marketing_agency: "Marketing & Media",
  internet_marketing_service: "Marketing & Media",
  social_media_agency: "Marketing & Media", public_relations: "Marketing & Media",
  b2b_advertising_and_marketing_service: "Marketing & Media",
  b2b_marketing_consultant: "Marketing & Media",
  sign_making: "Marketing & Media",
  event_photography_service: "Marketing & Media",
  // Property
  appraisal_service: "Property", real_estate_investment: "Property",
  // Logistics
  freight_and_cargo_service: "Logistics", railroad_freight: "Logistics",
  freight_forwarding_agency: "Logistics", motor_freight_trucking: "Logistics",
  courier_and_delivery_service: "Logistics", shipping_center: "Logistics",
  vehicle_shipping: "Logistics", warehouse: "Logistics",
  b2b_transportation_and_storage_service: "Logistics",
  post_office: SKIP,
  // Manufacturing
  manufacturer: "Manufacturing", chemical_plant: "Manufacturing",
  metal_fabricator: "Manufacturing", commercial_industrial: "Manufacturing",
  industrial_company: "Manufacturing", pharmaceutical_company: "Manufacturing",
  biotechnology_company: "Manufacturing", plastics_company: "Manufacturing",
  bottled_water_company: "Manufacturing", machine_shop: "Manufacturing",
  // Education / Professional Training
  vocational_and_technical_school: "Professional Training",
  computer_coaching: "Professional Training",
  cosmetology_school: "Professional Training",
  // Public schools and campus buildings are not businesses that will claim.
  elementary_school: SKIP, middle_school: SKIP, high_school: SKIP,
  public_school: SKIP, campus_building: SKIP, student_union: SKIP,
  library: SKIP, research_institute: SKIP, education_office: SKIP,
  // Food & Beverage
  caterer: "Food & Beverage", bakery: "Food & Beverage",
  // Health & Wellness
  pharmacy: "Health & Wellness", veterinarian: "Health & Wellness",
  gym: "Health & Wellness", fitness_trainer: "Health & Wellness",
  yoga_studio: "Health & Wellness", pilates_studio: "Health & Wellness",
  tattoo_and_piercing: "Personal & Home Services", shoe_repair: "Personal & Home Services",
  life_coach: "Personal & Home Services", image_consultant: "Personal & Home Services",
  // Construction & Trades (home_service is mixed — only the trades)
  contractor: "Construction & Trades", hvac_service: "Construction & Trades",
  electrician: "Construction & Trades", carpenter: "Construction & Trades",
  plumbing: "Construction & Trades", roofing: "Construction & Trades",
  painting: "Construction & Trades", windows_installation: "Construction & Trades",
  countertop_installation: "Construction & Trades",
  solar_installation: "Construction & Trades",
  fire_protection_service: "Construction & Trades",
  fence_and_gate_sales_service: "Construction & Trades",
  glass_and_mirror_sales_service: "Construction & Trades",
  water_heater_installation_repair: "Construction & Trades",
  key_and_locksmith: "Construction & Trades", handyman: "Construction & Trades",
  landscaping: "Construction & Trades", home_security: "Construction & Trades",
  elevator_service: "Construction & Trades",
  // Automotive (parts shops sit under shopping, so they need naming here)
  auto_parts_store: "Automotive", car_stereo_store: "Automotive",
  auto_company: "Automotive",
  boat_service: null, aircraft_service: null, car_rental_service: null,
  // Retail exceptions
  shopping_mall: SKIP, parking: SKIP,
  fueling_station: "Retail",

  // ── The six categories added Oct 2026 (businessVocab.js) ──────────────
  // Travel & Hospitality (lodging is a whole branch, below; these are the
  // travel firms, which sit under travel_and_transportation with the
  // stations and airports)
  travel_service: "Travel & Hospitality", travel_agent: "Travel & Hospitality",
  travel_company: "Travel & Hospitality", tour_operator: "Travel & Hospitality",
  sightseeing_tour_agency: "Travel & Hospitality",
  passport_and_visa_service: "Travel & Hospitality",
  // Events & Entertainment — but not public or gambling venues
  wedding_planning: "Events & Entertainment",
  casino: SKIP, betting_center: SKIP, lottery_vendor: SKIP,
  adult_entertainment_venue: SKIP, museum: SKIP, art_museum: SKIP,
  history_museum: SKIP, sculpture_statue: SKIP, observatory: SKIP,
  visitor_center: SKIP, stadium_arena: SKIP, football_stadium: SKIP,
  soccer_stadium: SKIP, track_stadium: SKIP, fairgrounds: SKIP,
  // Finance & Insurance
  bank_or_credit_union: "Finance & Insurance", bank: "Finance & Insurance",
  credit_union: "Finance & Insurance", insurance_agency: "Finance & Insurance",
  auto_insurance: "Finance & Insurance", financial_advising: "Finance & Insurance",
  investing: "Finance & Insurance", installment_loans: "Finance & Insurance",
  money_transfer_service: "Finance & Insurance", currency_exchange: "Finance & Insurance",
  mortgage_broker: "Finance & Insurance", stock_and_bond_broker: "Finance & Insurance",
  broker: "Finance & Insurance", trusts: "Finance & Insurance",
  credit_and_debt_counseling: "Finance & Insurance", collection_agency: "Finance & Insurance",
  atm: SKIP,
  // Business Services
  professional_service: "Business Services",
  corporate_or_business_office: "Business Services",
  b2b_service: "Business Services", b2b_business_management_service: "Business Services",
  business_consulting: "Business Services", b2b_human_resource_service: "Business Services",
  employment_agency: "Business Services", translation_service: "Business Services",
  coworking_space: "Business Services", cleaning_service: "Business Services",
  janitorial_service: "Business Services", merchandising_service: "Business Services",
  occupational_safety: "Business Services",
  // Personal & Home Services (the trades above win first)
  laundromat: "Personal & Home Services", laundry_service: "Personal & Home Services",
  dry_cleaning: "Personal & Home Services", sewing_and_alterations: "Personal & Home Services",
  tailor: "Personal & Home Services", funeral_service: "Personal & Home Services",
  pet_groomer: "Personal & Home Services", pet_boarding: "Personal & Home Services",
  pet_sitting: "Personal & Home Services", dog_trainer: "Personal & Home Services",
  pet_breeder: "Personal & Home Services", home_cleaning: "Personal & Home Services",
  pest_control_service: "Personal & Home Services", carpet_cleaning: "Personal & Home Services",
  pool_cleaning: "Personal & Home Services", appliance_repair_service: "Personal & Home Services",
  furniture_assembly: "Personal & Home Services", mover: "Personal & Home Services",
  damage_restoration: "Personal & Home Services", bike_repair_maintenance: "Personal & Home Services",
  // Wholesale & Distribution
  food_beverage_distributor: "Wholesale & Distribution", wholesale_grocer: "Wholesale & Distribution",
  meat_wholesaler: "Wholesale & Distribution", wholesaler: "Wholesale & Distribution",
  restaurant_wholesale: "Wholesale & Distribution", computer_wholesaler: "Wholesale & Distribution",
  supplier_or_distributor: "Wholesale & Distribution", b2b_food_products: "Wholesale & Distribution",
  metal_supplier: "Wholesale & Distribution", electronic_equipment_supplier: "Wholesale & Distribution",
  restaurant_equipment_and_supply: "Wholesale & Distribution",
  beauty_product_supplier: "Wholesale & Distribution",
  b2b_surgical_appliances_and_supplies: "Wholesale & Distribution",
  laboratory_equipment_supplier: "Wholesale & Distribution",
  business_office_supplies_and_stationery: "Wholesale & Distribution",
  hotel_supply_service: "Wholesale & Distribution", vending_machine_supplier: "Wholesale & Distribution",
  granite_supplier: "Wholesale & Distribution",
  b2b_international_trade_service: "Wholesale & Distribution",
  // Existing categories that were missing these
  day_care_preschool: "Education", child_care_and_day_care: "Education",
  retirement_home: "Health & Wellness",
};

const BY_BRANCH = {
  legal_service: "Law",
  building_or_construction_service: "Construction & Trades",
  real_estate_service: "Property",
  media_service: "Marketing & Media",
  printing_service: "Marketing & Media",
  design_service: "Design",
  shipping_or_delivery_service: "Logistics",
  storage_facility: "Logistics",
  place_of_learning: "Education",
  educational_service: "Education",
  education: "Education",
  health_care: "Health & Wellness",
  wellness_service: "Health & Wellness",
  personal_or_beauty_service: "Health & Wellness",
  sport_or_fitness_facility: "Health & Wellness",
  food_and_drink: "Food & Beverage",
  food_service: "Food & Beverage",
  event_or_party_service: "Events & Entertainment",
  arts_and_entertainment: "Events & Entertainment",
  lodging: "Travel & Hospitality",
  financial_service: "Finance & Insurance",
  animal_or_pet_service: "Personal & Home Services",
  home_service: "Personal & Home Services",
  vehicle_service: "Automotive",
  vehicle_dealer: "Automotive",
  shopping: "Retail",
  // Not businesses at all — dropped rather than overflowed, or overflow
  // would be half mosques and rivers.
  community_and_government: SKIP,
  cultural_and_historic: SKIP,
  geographic_entities: SKIP,
  park: SKIP,
  recreational_trail_or_path: SKIP,
  sport_league: SKIP,
  sport_team: SKIP,
};

function categoryOf(p) {
  const path = [p.category, ...[...(p.hierarchy || [])].reverse()].filter(Boolean);
  for (const key of path) {
    if (key in BY_CATEGORY) return BY_CATEGORY[key];
    if (key in BY_BRANCH) return BY_BRANCH[key];
    // Any *_manufacturer not listed above.
    if (/_manufacturer$/.test(key)) return "Manufacturing";
  }
  return null;
}

// ── Location ──────────────────────────────────────────────────────────────
//
// Postcode first (see common.mjs). Otherwise Overture's `locality`, which is
// reverse-geocoded to the mukim or town: reliable as far as it goes, but
// some values straddle two of our localities ("Petaling" covers parts of
// both KL and PJ), and those are left unclear on purpose.

const LOCALITY = {
  "kuala lumpur": "Kuala Lumpur", "bandar kuala lumpur": "Kuala Lumpur",
  "batu": "Kuala Lumpur", "setapak": "Kuala Lumpur", "kepong": "Kuala Lumpur",
  "cheras (kuala lumpur)": "Kuala Lumpur", "sentul": "Kuala Lumpur",
  "wangsa maju": "Kuala Lumpur", "bukit jalil": "Kuala Lumpur",
  "petaling jaya": "Petaling Jaya",
  "subang jaya": "Subang Jaya",
  "shah alam": "Shah Alam",
  "puchong": "Puchong",
  "bangsar": "Bangsar", "bangsar south": "Bangsar",
  "ampang": "Ampang", "ampang jaya": "Ampang", "pandan indah": "Ampang",
};
// Localities outside the original seven. Whichever of these are in the vocab
// become listings; the rest go to overflow with their name.
const OUTSIDE = {
  "klang": "Klang", "kapar": "Klang", "pelabuhan klang": "Klang",
  "seri kembangan": "Seri Kembangan", "kajang": "Kajang",
  "batu caves": "Selayang", "selayang": "Selayang",
  "gombak": "Selayang", "rawang": "Rawang",
  "bandar baru bangi": "Bangi", "bangi": "Bangi",
  "sungai buloh": "Sungai Buloh", "putrajaya": "Putrajaya",
  "cyberjaya": "Cyberjaya", "dengkil": "Dengkil", "semenyih": "Semenyih",
  "nilai": "Nilai", "banting": "Banting", "cheras": "Cheras (Selangor)",
  "balakong": "Cheras (Selangor)", "puncak alam": "Puncak Alam",
  "hulu langat": "Hulu Langat", "jenjarom": "Jenjarom", "ijok": "Ijok",
  "telok panglima garang": "Telok Panglima Garang",
  "bandar baru salak tinggi": "Sepang",
};

function locate(p) {
  const fromPc = locationFromPostcode(p.postcode);
  if (typeof fromPc === "string") return { location: fromPc, basis: "postcode" };
  if (fromPc?.outside) return { outside: fromPc.outside };
  const loc = (p.locality || "").toLowerCase().trim();
  if (LOCALITY[loc]) return { location: LOCALITY[loc], basis: "locality" };
  if (OUTSIDE[loc]) {
    return isValidLocation(OUTSIDE[loc])
      ? { location: OUTSIDE[loc], basis: "locality" }
      : { outside: OUTSIDE[loc] };
  }
  return {};
}

// ── Fields ────────────────────────────────────────────────────────────────

function website(p) {
  for (let w of p.websites || []) {
    w = String(w).trim();
    if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
    try {
      const u = new URL(w);
      // Social and marketplace pages are not the business's own website.
      if (/(facebook|fb|instagram|wa\.me|whatsapp|linktr\.ee|shopee|lazada|tiktok|youtube|twitter|x)\.(com|me|ee|my|co)/i.test(u.hostname)) continue;
      return u.href.replace(/\/$/, "");
    } catch { /* next */ }
  }
  return "";
}

// The first phone and email Overture has, and a WhatsApp number from a
// wa.me link among its websites (website() skips those as not the business's
// own site).
function contacts(p) {
  const phone = String((p.phones || [])[0] ?? "").trim();
  const email = String((p.emails || [])[0] ?? "").trim().toLowerCase();
  const wa = (p.websites || []).map((w) => String(w).match(/wa\.me\/\+?(\d{8,15})/)?.[1]).find(Boolean) ?? "";
  return { phone, email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) ? email : "", whatsapp: wa };
}

function address(p) {
  const street = (p.street || "").trim();
  if (!street) return "";
  const tail = [p.postcode, p.locality].filter(Boolean).join(" ");
  return [street, tail].filter(Boolean).join(", ");
}

async function main() {
  const src = path.join(DIR, "raw", "kv_places.ndjson");
  if (!fs.existsSync(src)) {
    console.error("Run scripts/sources/overture_fetch.py first.");
    process.exit(1);
  }
  const release = fs.readFileSync(path.join(DIR, "raw", "release.txt"), "utf8").trim();

  const stats = {
    release, minConfidence: MIN_CONFIDENCE, b2bMinConfidence: B2B_MIN_CONFIDENCE, raw: 0, lowConfidence: 0,
    closed: 0, branded: 0, notBusiness: 0, noName: 0, duplicate: 0,
    byBasis: {},
  };
  const candidates = [];
  const overflow = [];
  const names = nameLog();

  const lines = readline.createInterface({ input: fs.createReadStream(src) });
  for await (const line of lines) {
    const p = JSON.parse(line);
    stats.raw++;
    if (p.operating_status === "permanently_closed" || p.operating_status === "temporarily_closed") { stats.closed++; continue; }
    if (p.brand) { stats.branded++; continue; }
    const { name } = names.note(stats, `overture:${p.id}`, p.name, nameVerdict(p.name));
    if (!name) { stats.noName++; continue; }

    const category = categoryOf(p);
    if (category === SKIP) { stats.notBusiness++; continue; }
    const floor = B2B.has(category) ? B2B_MIN_CONFIDENCE : MIN_CONFIDENCE;
    if ((p.confidence ?? 0) < floor) { stats.lowConfidence++; continue; }
    const { location, basis, outside } = locate(p);
    const site = website(p);
    const what = p.category || (p.hierarchy || []).at(-1) || "";
    const sourceId = `overture:${p.id}`;

    const reasons = rejectReasons({ category, location, outside, what });
    if (reasons.length) {
      overflow.push({
        name,
        "what they do": what,
        "locality (as found)": outside || location || p.locality || p.postcode || "",
        "website or domain": site,
        "why it doesn't fit": reasons.join("; "),
        source: "Overture Maps",
        sourceId,
      });
      continue;
    }

    candidates.push({
      ...blankListing(),
      name, category, location,
      website: site,
      ...contacts(p),
      address: address(p),
      ...point(p.lat, p.lon),
      source: `Overture Maps (${(p.datasets || []).join("+")})`,
      sourceId,
      sourceYear: String(p.updated || "").slice(0, 4),
      locationBasis: basis,
      sourceType: what,
      _confidence: p.confidence,
    });
    stats.byBasis[basis] = (stats.byBasis[basis] || 0) + 1;
  }

  // Highest-confidence copy of a duplicate wins.
  candidates.sort((a, b) => b._confidence - a._confidence);
  const listings = assignIds(candidates, stats);
  for (const r of listings) delete r._confidence;

  writeOutputs(DIR, listings, overflow, stats, names);
  console.log("Data: Overture Maps Foundation, CDLA-Permissive-2.0 — attribute before publishing.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
