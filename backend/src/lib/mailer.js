import { Resend } from "resend";

// No API key configured (e.g. local dev without Resend set up) — every
// caller in this codebase already falls back to returning the token
// directly in its API response, so a missing provider is a silent no-op
// here rather than a hard failure.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Resend's shared sandbox address — works with no domain setup, but Resend
// will only actually deliver mail sent from it to the email on the
// account that owns the API key. Swap in a verified domain's address via
// RESEND_FROM_EMAIL once one exists.
const FROM = process.env.RESEND_FROM_EMAIL || "ABRI <onboarding@resend.dev>";

async function sendMail({ to, subject, html }) {
  if (!resend) {
    console.warn(`[mailer] RESEND_API_KEY not set — skipping email to ${to} ("${subject}")`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    console.error(`[mailer] Resend failed to send to ${to}:`, error);
  }
}

// Every verification-link email in this app (claim approval, domain-match
// auto-claim, self-register) shares this shape — a heading, a short
// message, and a single CTA link — just with different copy.
function sendVerificationEmail({ to, subject, heading, message, link }) {
  return sendMail({
    to,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>${heading}</h2>
        <p>${message}</p>
        <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">Continue</a></p>
        <p style="color: #666; font-size: 13px;">If the button doesn't work, copy and paste this link into your browser:<br>${link}</p>
      </div>
    `,
  });
}

export { sendMail, sendVerificationEmail };
