// Phone, WhatsApp and email from a business's own website: what
// crawl/websites.mjs pulls out of each page, and which of it merge.mjs
// keeps. The crawler saves every candidate; the choosing happens here, at
// merge time, so a rule change needs a re-merge and not a re-crawl.
//
// WHY THE EMAIL RULE IS STRICT. A listing's email is where an instant claim
// code goes (backend/src/lib/claimCode.js): whoever reads that inbox can own
// the listing. A web designer's address in a footer, or a parked domain's
// "buy this domain" address, would hand the listing to a stranger. So an
// email is kept only when it is
//   1. on the website's own domain (info@acme.com.my on acme.com.my, or
//      on acme.com: same name, other ending), or
//   2. a personal mailbox (Gmail, Yahoo, Hotmail …) the site links with
//      mailto:, when it is the only one the site links, or the only address
//      of any kind on the site, or
//   3. on another domain, but the only address the site links with mailto:
//      at all.
// Anything else is left out.

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.com.my", "ymail.com", "hotmail.com",
  "hotmail.my", "outlook.com", "outlook.my", "live.com", "live.com.my", "icloud.com", "me.com",
  "msn.com", "aol.com", "streamyx.com", "tm.net.my", "protonmail.com", "proton.me",
]);

// Placeholders, platform addresses and the like that sites carry but never
// mean "write to us".
const JUNK_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|yoursite\.com|company\.com|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|wix\.com|godaddy\.com|squarespace\.com|shopify\.com|wordpress\.(com|org)|w3\.org|schema\.org|hugedomains\.com|sedo\.com|dan\.com|afternic\.com|mysite\.com|test\.com)$/i;
const JUNK_EMAIL_LOCAL = /^(your|name|email|user|username|someone|john|jane|johndoe|test|noreply|no-reply|donotreply|do-not-reply|privacy|abuse|postmaster|webmaster|hostmaster|dpo|example)([._-]?name)?$/i;
const FILE_SUFFIX = /\.(png|jpe?g|gif|webp|svg|bmp|ico|css|js|pdf|mp4|webm)$/i;

const ROLE_ORDER = ["info", "enquiry", "enquiries", "inquiry", "contact", "hello", "sales", "admin", "office", "customerservice", "cs", "support"];

// Second-level suffixes that are part of the registrable domain:
// acme.com.my, not com.my.
const SECOND_LEVEL = new Set(["com", "net", "org", "edu", "gov", "co", "mil", "biz", "name", "ac", "or", "ne"]);

export function siteDomain(hostOrUrl) {
  let host = String(hostOrUrl ?? "").toLowerCase();
  try { if (host.includes("/")) host = new URL(host).hostname; } catch { return ""; }
  host = host.replace(/^www\d?\./, "").replace(/\.$/, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const [sld, tld] = parts.slice(-2);
  return tld.length === 2 && SECOND_LEVEL.has(sld) ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
}

export function cleanEmail(raw) {
  let e = decodeURIComponent(String(raw ?? "").replace(/%(?![0-9a-f]{2})/gi, "%25"))
    .replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
  e = e.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e)) return "";
  const [local, domain] = e.split("@");
  if (FILE_SUFFIX.test(e) || JUNK_EMAIL_DOMAIN.test(domain) || JUNK_EMAIL_LOCAL.test(local)) return "";
  if (local.length > 40 || /^[0-9a-f]{16,}$/.test(local)) return ""; // tracking ids
  return e;
}

// Malaysian numbers only, as +60…: 03-1234 5678, 012-345 6789, +6012…
// Returns "" for anything that isn't one.
export function cleanPhone(raw) {
  let d = String(raw ?? "").replace(/^tel:/i, "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0060")) d = d.slice(2);
  if (d.startsWith("0")) d = "6" + d;
  if (!d.startsWith("60")) return "";
  const n = d.slice(2);
  if (/^1\d{8,9}$/.test(n)) return "+60" + n;     // mobile: 01x-xxx xxxx(x)
  if (/^3\d{8}$/.test(n)) return "+60" + n;       // Klang Valley landline
  if (/^[4-9]\d{7,8}$/.test(n)) return "+60" + n; // other states, 1-300/1-800 aside
  return "";
}

const PHONE_IN_TEXT = /(?:\+?6\s?0|\b0)\s?(?:1\d|[3-9])[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g;
const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

// Everything a page offers. `via` says how sure we can be: a tel:/mailto:
// link was put there to be used; a number in running text might be a fax.
export function extract(html) {
  const emails = [], phones = [], whatsapp = [];
  const seen = new Set();
  const add = (list, value, via) => {
    if (!value || seen.has(`${list === emails ? "e" : list === phones ? "p" : "w"}:${value}`)) return;
    seen.add(`${list === emails ? "e" : list === phones ? "p" : "w"}:${value}`);
    list.push({ value, via });
  };
  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'?]+)/gi)) add(emails, cleanEmail(m[1]), "mailto");
  for (const m of html.matchAll(/href\s*=\s*["']\s*tel:([^"']+)/gi)) add(phones, cleanPhone(m[1]), "tel");
  for (const m of html.matchAll(/(?:wa\.me\/|whatsapp\.com\/send\/?\?phone=)\+?(\d{9,13})/gi)) add(whatsapp, cleanPhone(m[1]).replace(/^\+/, ""), "link");

  const text = visibleText(html);
  for (const m of text.matchAll(EMAIL_IN_TEXT)) add(emails, cleanEmail(m[0]), "text");
  for (const m of text.matchAll(PHONE_IN_TEXT)) {
    // A fax number is a phone number nobody answers.
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/fax|faks/i.test(before)) continue;
    add(phones, cleanPhone(m[0]), "text");
  }
  return { emails, phones, whatsapp };
}

function visibleText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#64;|&commat;/g, "@")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// The contacts to keep for a website, from the crawler's saved record:
// { phone, whatsapp, email } with "" for anything not found or not trusted.
export function pickContacts(record) {
  const out = { phone: "", whatsapp: "", email: "" };
  if (!record || record.status !== "ok") return out;
  const domain = siteDomain(record.finalUrl || record.url);

  const emails = record.emails ?? [];
  const brand = domain.split(".")[0];
  const own = emails.filter((e) => {
    const d = siteDomain(e.value.split("@")[1]);
    return d === domain || d.split(".")[0] === brand;
  });
  const linked = emails.filter((e) => e.via === "mailto");
  const linkedFree = linked.filter((e) => FREE_MAIL.has(e.value.split("@")[1]));
  // Recruiting and billing inboxes are the business's too, but last resorts.
  const roleRank = (e) => {
    const local = e.value.split("@")[0];
    if (/^(careers?|jobs?|hr|recruit(ment)?|hiring|resumes?|cv|invoices?|billing|accounts?)$/.test(local)) return ROLE_ORDER.length + 1;
    const i = ROLE_ORDER.indexOf(local);
    return i < 0 ? ROLE_ORDER.length : i;
  };
  if (own.length) out.email = [...own].sort((a, b) => roleRank(a) - roleRank(b))[0].value;
  else if (new Set(linkedFree.map((e) => e.value)).size === 1) out.email = linkedFree[0].value;
  else if (emails.length === 1 && FREE_MAIL.has(emails[0].value.split("@")[1])) out.email = emails[0].value;
  else if (new Set(linked.map((e) => e.value)).size === 1) out.email = linked[0].value;

  const phones = record.phones ?? [];
  out.phone = (phones.find((p) => p.via === "tel") ?? phones[0])?.value ?? "";
  out.whatsapp = (record.whatsapp ?? [])[0]?.value ?? "";
  return out;
}

// A "website" that is only a WhatsApp link — wa.me/6012…, wasap.my/6012… —
// is the business's WhatsApp number, no crawl needed. "" otherwise.
export function whatsappFromWebsite(url) {
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:wa\.me|wasap\.my|watsap\.my|wsap\.my|api\.whatsapp\.com\/send\/?\?phone=)\/?\+?(\d{9,13})/i.exec(String(url ?? "").trim());
  return m ? cleanPhone(m[1]).replace(/^\+/, "") : "";
}
