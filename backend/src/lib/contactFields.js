// Validation and normalisation for the fields an owner may edit on their own
// business — everything PATCH /businesses/me accepts. Kept apart from
// lib/contactVisibility.js on purpose: that one answers "who may SEE this",
// this one answers "what may be STORED". Keeping them separate is what lets
// the route body stay short enough to read the guards at a glance.
//
// Normalisation happens on WRITE, never on render. The alternative — store
// what the owner typed and tidy it up at each display site — means every
// render site re-derives the same rules, and the first one that gets it wrong
// ships a dead tel: or wa.me link that nobody notices because the profile
// still looks fine.

// Third copy of this regex in the codebase (routes/auth.js:16 and
// routes/businesses.js:19 have their own). Deliberately not consolidated here
// — those two validate a LOGIN credential during registration and claiming,
// which is a different job from validating a published contact address, and
// merging them would couple claim validation to this module. Worth a small
// cleanup pass of its own.
const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Malaysia-only assumption, and the one thing to change if that stops being
// true. It matches the rest of the product — `ssm` registration numbers, Klang
// Valley `location` values — so a local number typed as "012-345 6789" is what
// members will actually enter.
const DEFAULT_COUNTRY_CODE = "60";

// Every field an owner may set, and the only list that decides it. A key not
// named here is rejected rather than dropped: see the note in the route.
const EDITABLE_FIELDS = [
  "description",
  "services",
  "phone",
  "whatsapp",
  "email",
  "website",
  "address",
  "openingHours",
];

// Rejected loudly rather than ignored, with a reason, because each one is a
// question somebody will reasonably ask:
//   verificationLevel — earned via POST /admin/businesses/:id/verify-ssm. Self-
//                     service would make the badge worthless, which is the
//                     entire product.
//   membershipTier  — POST /admin/businesses/:id/plan is the only writer.
//     membershipTierStartedAt   Self-serve here is free Plus for everyone, including
//     membershipTierExpiresAt   the gate these very fields sit behind.
//   isFoundingMember— only ever set true, by lib/businessClaim.js. It was
//                     split out of membershipTier precisely so no later write
//                     could erase it; even the admin plan route won't touch it.
//   domain          — feeds matchesBusinessDomain, which AUTO-APPROVES claims.
//                     An owner who can set this can pre-approve their own next
//                     claim. schema.prisma already calls it "never claimant-
//                     editable"; this is the first place that is enforceable
//                     rather than aspirational.
//   id              — the slug in every URL and printed on every NFC card.
//   name, ssm       — what SSM verification was performed against.
//   category        — keys CATEGORY_SERVICES.
//   location        — arguable, but it's a directory facet; out of scope here.
const PROTECTED_FIELDS = [
  "id",
  "name",
  "category",
  "location",
  "verificationLevel",
  "ssm",
  "domain",
  "membershipTier",
  "membershipTierStartedAt",
  "membershipTierExpiresAt",
  "isFoundingMember",
];

const MAX = {
  description: 2000,
  phone: 32,
  whatsapp: 32,
  email: 254,
  website: 300,
  address: 300,
  openingHours: 400,
  service: 60,
  services: 20,
};

// Empty string means "clear this field", and it stores as null rather than "".
// One value for "no phone number" instead of two is the whole point: every
// reader would otherwise have to check both, and the one that forgets renders
// an empty tel: link.
function blankToNull(value) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizePhone(raw) {
  const value = blankToNull(raw.replace(/\s+/g, " "));
  if (value === null) return { value: null };
  if (value.length > MAX.phone) return { error: `Phone number is too long (max ${MAX.phone}).` };
  // Loose on purpose: it renders as text and inside a tel: link, both of which
  // tolerate punctuation, and a strict pattern would reject valid landline and
  // extension formats members actually have.
  if (!/^[+(\d][\d\s()+\-]{5,}$/.test(value)) {
    return { error: "Phone number doesn't look like a phone number." };
  }
  return { value };
}

// Stored as BARE DIGITS with the country code, because it is consumed as
// https://wa.me/<digits> and wa.me rejects punctuation and leading zeros. This
// is the one field where the stored form differs visibly from what was typed,
// and that is deliberate — see the note at the top of this file.
function normalizeWhatsapp(raw) {
  if (blankToNull(raw) === null) return { value: null };
  if (raw.length > MAX.whatsapp) return { error: `WhatsApp number is too long (max ${MAX.whatsapp}).` };

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  if (digits.length < 9 || digits.length > 15) {
    return { error: "WhatsApp number doesn't look like a phone number." };
  }
  return { value: digits };
}

function normalizeEmail(raw) {
  const value = blankToNull(raw);
  if (value === null) return { value: null };
  if (value.length > MAX.email) return { error: `Email is too long (max ${MAX.email}).` };
  if (!EMAIL_RE.test(value)) return { error: "Contact email doesn't look like an email address." };
  return { value: value.toLowerCase() };
}

// The ONLY field here that becomes something the browser may execute, so the
// protocol allowlist is a security control and belongs on the server. React
// escapes text but happily renders href="javascript:...", so leaving this to
// the client would be leaving it undone.
function normalizeWebsite(raw) {
  const value = blankToNull(raw);
  if (value === null) return { value: null };
  if (value.length > MAX.website) return { error: `Website is too long (max ${MAX.website}).` };

  // Members type "meridianaccounting.my", not a full URL. Only prefix when
  // there is no scheme at all — prefixing something that already has one is
  // how "javascript:alert(1)" would sneak past as a path.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const candidate = hasScheme ? value : `https://${value.replace(/^\/+/, "")}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { error: "Website doesn't look like a valid address." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Website must be an http:// or https:// address." };
  }
  if (!url.hostname || !url.hostname.includes(".")) {
    return { error: "Website doesn't look like a valid address." };
  }
  return { value: url.toString() };
}

// No parsing whatsoever — this is free text by design (see schema.prisma).
// Newlines are preserved because members write one line per day; runs of blank
// lines are collapsed so a stray paste can't stretch the profile card.
function normalizeOpeningHours(raw) {
  const value = blankToNull(raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n"));
  if (value === null) return { value: null };
  if (value.length > MAX.openingHours) {
    return { error: `Opening hours are too long (max ${MAX.openingHours}).` };
  }
  return { value };
}

function normalizeServices(raw) {
  if (!Array.isArray(raw)) return { error: "Services must be a list." };
  const services = raw
    .filter((s) => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  if (services.length !== raw.length && raw.some((s) => typeof s !== "string")) {
    return { error: "Services must all be text." };
  }
  if (services.length > MAX.services) {
    return { error: `Too many services (max ${MAX.services}).` };
  }
  if (services.some((s) => s.length > MAX.service)) {
    return { error: `Each service must be ${MAX.service} characters or fewer.` };
  }
  return { value: services };
}

function normalizeDescription(raw) {
  const value = blankToNull(raw);
  if (value === null) return { value: null };
  if (value.length > MAX.description) {
    return { error: `Description is too long (max ${MAX.description}).` };
  }
  return { value };
}

const NORMALIZERS = {
  description: normalizeDescription,
  services: normalizeServices,
  phone: normalizePhone,
  whatsapp: normalizeWhatsapp,
  email: normalizeEmail,
  website: normalizeWebsite,
  address: (raw) => {
    const value = blankToNull(raw);
    if (value !== null && value.length > MAX.address) {
      return { error: `Address is too long (max ${MAX.address}).` };
    }
    return { value };
  },
  openingHours: normalizeOpeningHours,
};

// Returns { data } with ONLY the keys the caller actually sent, or { error }
// with a message safe to hand straight back to the member.
//
// Real PATCH semantics, and the two cases are genuinely different: a key that
// is ABSENT leaves the column alone, while a key sent as "" CLEARS it. Built
// with Object.hasOwn rather than truthiness for exactly that reason — `??` or
// a falsy check would make clearing a field indistinguishable from not
// touching it, and there'd be no way to remove a phone number once added.
function normalizeBusinessEdit(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Expected a JSON object." };
  }

  // Rejected, not filtered. A member who believes they just set their own tier
  // to T4 should be told they didn't — silently returning 200 on a write that
  // did nothing is the same response as a write that worked, which is the
  // worst way to find out. It also turns a privilege-escalation attempt into a
  // clear error instead of a false success.
  const forbidden = Object.keys(body).filter((k) => PROTECTED_FIELDS.includes(k));
  if (forbidden.length > 0) {
    return {
      error: `These fields can't be changed here: ${forbidden.join(", ")}.`,
    };
  }

  const unknown = Object.keys(body).filter((k) => !EDITABLE_FIELDS.includes(k));
  if (unknown.length > 0) {
    return { error: `Unknown fields: ${unknown.join(", ")}.` };
  }

  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (!Object.hasOwn(body, field)) continue;

    const raw = body[field];
    // null is accepted as an explicit clear, same as "".
    if (raw === null) {
      data[field] = field === "services" ? [] : null;
      continue;
    }
    if (field !== "services" && typeof raw !== "string") {
      return { error: `${field} must be text.` };
    }

    const { value, error } = NORMALIZERS[field](raw);
    if (error) return { error };
    data[field] = value;
  }

  if (Object.keys(data).length === 0) {
    return { error: "Nothing to update." };
  }
  return { data };
}

export { normalizeBusinessEdit, EDITABLE_FIELDS, PROTECTED_FIELDS, DEFAULT_COUNTRY_CODE };
