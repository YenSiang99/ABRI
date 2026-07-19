import { useSyncExternalStore } from "react";

import { businesses as seedBusinesses } from "@/data/businesses";
import { readJSON, writeJSON } from "./persist";

const BUSINESSES_KEY = "abri:businesses:v1";

const CATEGORY_SERVICES = {
  "Accounting & Tax": ["SSM filings", "Tax advisory", "Bookkeeping", "Payroll"],
  "Corporate Secretarial": ["Company incorporation", "Statutory filings", "Compliance advisory"],
  Law: ["Contracts", "Corporate structuring", "Dispute resolution"],
  "IT Consulting": ["Cloud migration", "Systems integration", "IT infrastructure"],
};

const TESTIMONIAL_TEMPLATES = [
  "Fast, reliable, and always responsive — exactly what we needed.",
  "Handled a complex matter for us without missing a beat.",
  "Clear communication from day one. Would work with them again.",
  "Solved a problem two other firms couldn't figure out.",
  "Professional, on time, and easy to work with.",
  "Their attention to detail saved us from a costly mistake.",
  "Consistently delivers ahead of deadline.",
  "Straightforward pricing and no surprises.",
];

const RELATIVE_DATES = ["3 days ago", "1 week ago", "2 weeks ago", "3 weeks ago", "1 month ago", "2 months ago"];

const tierLabel = {
  T0: "Listed",
  T1: "Claimed",
  T2: "SSM-Verified",
  T3: "Identity-Verified",
  T4: "Transaction-Trusted",
};

const ladderLabel = {
  none: "New Member",
  first: "First Vouch",
  top20: "Top 20%",
  trusted: "Trusted Business",
  leader: "Network Leader",
};

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mulberry32(seed) {
  return function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(array, seed) {
  const result = [...array];
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ssmFor(id) {
  const hash = hashString(id);
  const year = 2005 + (hash % 20);
  const serial = String(hash % 100000000).padStart(8, "0");
  return `${year}${serial}`;
}

function ladderFor(vouchCount) {
  if (vouchCount >= 10) return "trusted";
  if (vouchCount >= 5) return "top20";
  if (vouchCount >= 1) return "first";
  return "none";
}

function vouchesFor(business, allSeed) {
  // Vouching only starts once a business is SSM-Verified (T2) — a T1
  // "Claimed, pending" listing can't have received vouches yet, so any
  // seeded T1 vouch counts are reset to zero here.
  if (!business.vouchCount || business.tier !== "T2") return [];
  const seed = hashString(business.id);
  const others = seededShuffle(
    allSeed.filter((b) => b.id !== business.id),
    seed,
  );
  return Array.from({ length: business.vouchCount }, (_, i) => {
    const voucher = others[i % others.length];
    return {
      id: `${business.id}-vouch-${i}`,
      fromBusinessId: voucher.id,
      fromName: voucher.name,
      testimonial: TESTIMONIAL_TEMPLATES[(seed + i * 3) % TESTIMONIAL_TEMPLATES.length],
      date: RELATIVE_DATES[i % RELATIVE_DATES.length],
    };
  });
}

function seedBusinessRecord(raw, allSeed) {
  const vouches = vouchesFor(raw, allSeed);
  const now = new Date().toISOString();
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    location: raw.location,
    tier: raw.tier,
    vouchCount: vouches.length,
    vouches,
    ladder: ladderFor(vouches.length),
    description: raw.description,
    services: CATEGORY_SERVICES[raw.category] ?? [],
    ssm: raw.tier === "T0" ? "" : ssmFor(raw.id),
    claimedByAccountId: null,
    // Seed data represents claims that were already established before this
    // approval workflow existed, so they start pre-approved.
    claimStatus: raw.tier === "T0" ? null : "approved",
    createdAt: now,
    updatedAt: now,
  };
}

let businessCache = null;
const businessListeners = new Set();

function loadBusinesses() {
  if (businessCache) return businessCache;
  let stored = readJSON(BUSINESSES_KEY, null);
  if (!stored) {
    stored = seedBusinesses.map((b) => seedBusinessRecord(b, seedBusinesses));
    writeJSON(BUSINESSES_KEY, stored);
  }
  businessCache = stored;
  return businessCache;
}

function persistBusinesses() {
  writeJSON(BUSINESSES_KEY, businessCache);
  businessListeners.forEach((cb) => cb());
}

function subscribeBusinesses(cb) {
  businessListeners.add(cb);
  return () => businessListeners.delete(cb);
}

function getBusinessesSnapshot() {
  return loadBusinesses();
}

function useBusinesses() {
  return useSyncExternalStore(subscribeBusinesses, getBusinessesSnapshot);
}

function useBusiness(id) {
  const all = useBusinesses();
  return id ? (all.find((b) => b.id === id) ?? null) : null;
}

function getBusiness(id) {
  return loadBusinesses().find((b) => b.id === id) ?? null;
}

function updateBusiness(id, updater) {
  const all = loadBusinesses();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const next = { ...all[idx], ...updater(all[idx]), updatedAt: new Date().toISOString() };
  businessCache = [...all.slice(0, idx), next, ...all.slice(idx + 1)];
  persistBusinesses();
  return next;
}

function setTier(id, tier) {
  return updateBusiness(id, () => ({ tier }));
}

function updateBusinessProfile(id, { description, services }) {
  return updateBusiness(id, () => ({
    ...(description !== undefined ? { description } : {}),
    ...(services !== undefined ? { services } : {}),
  }));
}

function addVouch(toBusinessId, { fromBusinessId, fromName, testimonial }) {
  return updateBusiness(toBusinessId, (b) => {
    const vouch = {
      id: `${toBusinessId}-vouch-${Date.now()}`,
      fromBusinessId,
      fromName,
      testimonial,
      date: "Just now",
    };
    const vouches = [vouch, ...b.vouches];
    return { vouches, vouchCount: vouches.length, ladder: ladderFor(vouches.length) };
  });
}

function listVouchesGivenBy(businessId) {
  return loadBusinesses().flatMap((b) =>
    b.vouches
      .filter((v) => v.fromBusinessId === businessId)
      .map((v) => ({ ...v, toBusinessId: b.id, toName: b.name })),
  );
}

function claimOrCreateBusiness({ businessId, name, category, location, ssm, description }) {
  const all = loadBusinesses();
  const existing = businessId ? all.find((b) => b.id === businessId && b.tier === "T0") : null;

  if (existing) {
    const nextCategory = category || existing.category;
    const nextName = name || existing.name;
    return updateBusiness(businessId, () => ({
      name: nextName,
      category: nextCategory,
      location: location || existing.location,
      ssm: ssm || existing.ssm || ssmFor(businessId),
      // The seed description says "Not yet claimed by an owner" — no
      // longer true once claimed, so replace it rather than carry it over.
      description: description || `${nextName} — recently claimed by its owner on ABRI.`,
      services: CATEGORY_SERVICES[nextCategory] ?? [],
      tier: "T1",
      claimStatus: "pending",
    }));
  }

  let id = slugify(name) || "business";
  if (all.some((b) => b.id === id)) {
    id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const now = new Date().toISOString();
  const record = {
    id,
    name,
    category,
    location,
    tier: "T1",
    vouchCount: 0,
    vouches: [],
    ladder: "none",
    description: description || `${name} — newly registered on ABRI.`,
    services: CATEGORY_SERVICES[category] ?? [],
    ssm: ssm || ssmFor(id),
    claimedByAccountId: null,
    claimStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
  businessCache = [...all, record];
  persistBusinesses();
  return record;
}

function setBusinessOwner(businessId, accountId) {
  return updateBusiness(businessId, () => ({ claimedByAccountId: accountId }));
}

function approveClaim(businessId) {
  return updateBusiness(businessId, () => ({ claimStatus: "approved" }));
}

// Used both to reject a pending claim and to revoke one already approved
// (e.g. discovered to be wrongful or malicious after the fact) — either way
// the listing goes back to unclaimed so it can be claimed again correctly.
function removeClaim(businessId) {
  return updateBusiness(businessId, () => ({
    tier: "T0",
    ssm: "",
    claimedByAccountId: null,
    claimStatus: null,
  }));
}

loadBusinesses();

export {
  useBusinesses,
  useBusiness,
  getBusiness,
  claimOrCreateBusiness,
  setTier,
  updateBusinessProfile,
  addVouch,
  listVouchesGivenBy,
  setBusinessOwner,
  approveClaim,
  removeClaim,
  tierLabel,
  ladderLabel,
  slugify,
};
