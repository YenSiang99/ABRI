import crypto from "node:crypto";

import { prisma } from "../prisma.js";
import { sendMail } from "./mailer.js";
import { UNCLAIMED } from "./verificationLevels.js";

// Claiming by a code sent to the email a listing ALREADY has on file
// (ABRI-launch-access-plan.md step 2). The listing's email came from a public
// source and the claimant cannot edit it before approval, so whoever can read
// that inbox is very likely at the business — about as strong as the domain
// match lib/domainVerification.js has always accepted, and available for the
// ~98k listings that have an email where no listing has a domain.
//
// It is a shortcut, never the only door: anyone who can't reach the inbox
// waits for the admin as before.

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Per claimant: enough for "it went to spam, send another", not enough to
// make a nuisance of the business's inbox.
const MAX_SENDS_PER_ACCOUNT_PER_HOUR = 3;
// Per listing, across every claimant: the inbox belongs to a business that
// never asked to hear from us, so a crowd of fresh accounts must not be able
// to flood it either.
const MAX_SENDS_PER_BUSINESS_PER_DAY = 5;

// "info@company.my" → "i***@company.my". Enough for the claimant to recognise
// the inbox, not enough to read an address off a listing they don't own.
function maskEmail(email) {
  const [local, domain] = String(email ?? "").split("@");
  if (!local || !domain) return null;
  return `${local.charAt(0)}***@${domain}`;
}

// Where a code for this listing would go, or null when there is no code path:
// no email on file, or the listing is not an unclaimed one from a source (a
// brand-new business typed in by its claimant has no independent email to
// prove anything with).
function claimCodeTarget(business) {
  if (!business || business.verificationLevel !== UNCLAIMED) return null;
  const email = String(business.email ?? "").trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
}

// Keyed per account, so a code is useless to any other claimant even if it
// leaked.
function hashCode(code, accountId) {
  return crypto.createHash("sha256").update(`${accountId}:${code}`).digest("hex");
}

// The claimant TYPES their name, and this email goes to a stranger's inbox —
// unescaped, a name could carry a link or markup into a message that looks
// like it came from us.
function escapeHtml(value) {
  return String(value ?? "").slice(0, 120).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

class ClaimCodeError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

async function sendClaimCode({ account, business }) {
  const sentTo = claimCodeTarget(business);
  if (!sentTo) throw new ClaimCodeError(400, "This listing has no email on file to send a code to.");

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [byAccount, byBusiness] = await Promise.all([
    prisma.claimCode.count({ where: { accountId: account.id, createdAt: { gt: hourAgo } } }),
    prisma.claimCode.count({ where: { businessId: business.id, createdAt: { gt: dayAgo } } }),
  ]);
  if (byAccount >= MAX_SENDS_PER_ACCOUNT_PER_HOUR || byBusiness >= MAX_SENDS_PER_BUSINESS_PER_DAY) {
    throw new ClaimCodeError(429, "Too many codes sent for this listing. Try again later, or wait for the admin review.");
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.claimCode.create({
    data: {
      accountId: account.id,
      businessId: business.id,
      sentTo,
      codeHash: hashCode(code, account.id),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  const who = escapeHtml(account.name);
  const what = escapeHtml(business.name);
  // Written for a reader who never heard of ABRI: this goes to an address we
  // found in a public listing, on a stranger's request. It says who asked,
  // what the code does, and that ignoring it is safe.
  await sendMail({
    to: sentTo,
    subject: `${code} is your code to claim ${business.name} on ABRI`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Claim ${what} on ABRI</h2>
        <p>${who} asked to manage ${what}'s listing on ABRI, a directory of verified Malaysian businesses. This email address is listed for the business, so we sent the code here.</p>
        <p style="font-size: 28px; letter-spacing: 6px; font-weight: bold;">${code}</p>
        <p>If ${who} works with you, give them this code. It expires in 15 minutes.</p>
        <p style="color: #666; font-size: 13px;">If you don't know them, ignore this email — nothing changes without the code.</p>
      </div>
    `,
  });

  return { sentTo: maskEmail(sentTo), code };
}

// Returns normally on a correct code (and consumes it); throws otherwise.
async function checkClaimCode({ account, business, code }) {
  const latest = await prisma.claimCode.findFirst({
    where: { accountId: account.id, businessId: business.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!latest || latest.expiresAt < new Date() || latest.attempts >= MAX_ATTEMPTS) {
    throw new ClaimCodeError(400, "That code has expired. Send a new one.", { expired: true });
  }
  // The inbox it went to must still be the listing's inbox.
  if (latest.sentTo !== claimCodeTarget(business)) {
    throw new ClaimCodeError(400, "The listing's email has changed since the code was sent. Send a new one.", { expired: true });
  }

  const given = String(code ?? "").replace(/\D/g, "");
  const expected = Buffer.from(latest.codeHash, "hex");
  const actual = Buffer.from(hashCode(given, account.id), "hex");
  if (given.length !== 6 || !crypto.timingSafeEqual(expected, actual)) {
    const updated = await prisma.claimCode.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
    });
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - updated.attempts);
    throw new ClaimCodeError(400, attemptsLeft ? "That code isn't right." : "Too many wrong codes. Send a new one.", {
      attemptsLeft,
      expired: attemptsLeft === 0,
    });
  }

  await prisma.claimCode.update({ where: { id: latest.id }, data: { consumedAt: new Date() } });
}

export { claimCodeTarget, maskEmail, sendClaimCode, checkClaimCode, ClaimCodeError };
