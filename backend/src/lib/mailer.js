import nodemailer from "nodemailer";

// Outgoing email goes through plain SMTP, so no mail company is built into
// the code: Google Workspace, Zoho, Amazon SES or anything else that offers
// SMTP is a matter of server settings.
//
//   SMTP_HOST   e.g. smtp.gmail.com, smtp.zoho.com, email-smtp.<region>.amazonaws.com
//   SMTP_PORT   465 (implicit TLS) or 587 (STARTTLS); default 587
//   SMTP_USER   the login the provider gives you
//   SMTP_PASS   its password (for Google: an app password, not the account's)
//   MAIL_FROM   who the email says it is from, e.g. "ABRI <hello@abri.asia>"
//
// No SMTP_HOST means no mail is sent. That is normal on a developer's own
// machine and in the test API; on a server it is logged loudly at boot.
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

const FROM = process.env.MAIL_FROM || process.env.SMTP_USER || "ABRI <hello@abri.asia>";

const isProduction = process.env.NODE_ENV === "production";
// Links and codes are shown on screen instead of emailed only where nobody
// real can be fooled by it: a machine with no mail set up that is not a
// production build (a developer's laptop, the test API), or a server that
// opts in with MAIL_SHOW_LINKS=1 (dev.abri.asia). Never prod.
const showLinks = !transport && (!isProduction || process.env.MAIL_SHOW_LINKS === "1");

if (!transport && isProduction) {
  console.warn(
    showLinks
      ? "[mailer] No SMTP_HOST: emails are not sent; links and codes are shown on screen (MAIL_SHOW_LINKS=1)."
      : "[mailer] No SMTP_HOST: emails are NOT being sent. Sign-up confirmations and claim codes will not arrive.",
  );
}

async function sendMail({ to, subject, html }) {
  if (!transport) {
    console.warn(`[mailer] SMTP_HOST not set — skipping email to ${to} ("${subject}")`);
    return;
  }
  try {
    await transport.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[mailer] failed to send to ${to}:`, err.message);
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

// A link token or code for an API response, so the screen can show it in
// place of an email — ONLY where showLinks allows (see above).
//
// Every route that mints a link used to return its token in the response
// unconditionally. With real email that turns "we emailed you a link" into
// "here is the link": whoever submits the form proves nothing about the
// inbox. And on a live server with mail not yet set up it would be the same
// hole, so production never shows them.
function devOnlyToken(token) {
  return showLinks ? token : undefined;
}

export { sendMail, sendVerificationEmail, devOnlyToken };
