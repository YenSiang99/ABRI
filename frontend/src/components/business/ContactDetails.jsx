import { Link, useLocation } from "react-router-dom";
import { Clock, Globe, Lock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";


// One business's contact block, used on the public profile and on the NFC tap
// page. Two groups of fields with two different rules, which is why they're
// rendered by one component rather than pasted into each page:
//
//   PUBLIC  — website, address, opening hours. Always sent, always shown.
//   GATED   — phone, WhatsApp, email. The server withholds these unless the
//             OWNER is on Plus or above AND the viewer is logged in. When it
//             withholds them the KEYS ARE ABSENT, not null, so there is no
//             masked value here to un-mask and nothing to blur.
//
// The gate is never re-derived on this side. `contactLocked` and
// `contactLockedReason` come straight from GET /businesses/:id — see
// backend/src/lib/contactVisibility.js, which is the only place the rule
// exists.
function ContactRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-grey-500 dark:text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 break-words text-sm text-ink dark:text-foreground">{children}</div>
      </div>
    </div>
  );
}

const linkClass =
  "underline underline-offset-4 hover:text-grey-600 dark:hover:text-muted-foreground";

// The scheme is stripped for display only — the href keeps the full absolute
// URL the server normalised and validated (http/https only, enforced in
// backend/src/lib/contactFields.js).
function hostOf(website) {
  try {
    return new URL(website).host;
  } catch {
    return website;
  }
}

function ContactDetails({ business, contactLocked, contactLockedReason, ownerView = false }) {
  const location = useLocation();
  const { name, phone, whatsapp, email, website, address, openingHours } = business;

  const hasPublic = Boolean(website || address || openingHours);
  const hasGated = Boolean(phone || whatsapp || email);

  // Three states, not two. "Withheld" and "the owner hasn't added any" must
  // not render the same — the server sends contactLocked false with all three
  // fields null for the second case, and showing a lock there would blame a
  // gate for an empty field.
  // Rendered as one more ContactRow rather than a dashed panel, so a withheld
  // field costs a row of space instead of a block of it. The old panel was
  // ~150px of centred furniture announcing the absence of a phone number,
  // directly under three compact rows — more visual weight than the thing it
  // was standing in for.
  //
  // Note what this CAN'T say: the server omits the keys entirely rather than
  // nulling them, so we don't know whether this business has a phone, a
  // WhatsApp, all three, or none. Hence one row covering the group, never a
  // per-field placeholder — that would leak exactly what the gate withholds.
  let gated;
  if (contactLocked) {
    gated =
      contactLockedReason === "viewer_anonymous" ? (
        <ContactRow icon={Lock} label="Phone, WhatsApp & email">
          {/* "free" is load-bearing. Without it an anti-scraping gate reads
              as a paywall, and we lose the registration this row exists to
              win — the viewer's plan has nothing to do with it. */}
          <span className="text-grey-600 dark:text-muted-foreground">Shown to members. </span>
          <Link to="/login" state={{ from: location }} className={linkClass}>
            Log in
          </Link>
          <span className="text-grey-600 dark:text-muted-foreground"> or </span>
          <Link to="/register" className={linkClass}>
            create a free account
          </Link>
        </ContactRow>
      ) : (
        // reason === "owner_plan". No link and no mention of a plan: the
        // visitor can do nothing about this, and naming the plan would
        // surface someone's billing status as a profile signal, which
        // schema.prisma's membershipPlan comment rules out.
        <ContactRow icon={Lock} label="Contact details">
          <span className="text-grey-600 dark:text-muted-foreground">
            {name} hasn&apos;t published a phone number, WhatsApp or email.
          </span>
        </ContactRow>
      );
  } else if (hasGated) {
    gated = (
      <div className="grid gap-4 sm:grid-cols-2">
        {phone && (
          <ContactRow icon={Phone} label="Phone">
            <a href={`tel:${phone.replace(/\s+/g, "")}`} className={linkClass}>
              {phone}
            </a>
          </ContactRow>
        )}
        {whatsapp && (
          <ContactRow icon={MessageCircle} label="WhatsApp">
            {/* Stored as bare digits precisely so this link needs no parsing
                here — see normalizeWhatsapp in backend/src/lib/contactFields.js. */}
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noreferrer noopener"
              className={linkClass}
            >
              +{whatsapp}
            </a>
          </ContactRow>
        )}
        {email && (
          <ContactRow icon={Mail} label="Email">
            <a href={`mailto:${email}`} className={linkClass}>
              {email}
            </a>
          </ContactRow>
        )}
      </div>
    );
  } else if (ownerView) {
    // Only the owner is told the block is empty. A visitor doesn't need to
    // know the difference, but the owner is the one person who can fix it.
    gated = (
      <p className="text-sm text-grey-500 dark:text-muted-foreground">
        You haven't added a phone number, WhatsApp or contact email yet.
      </p>
    );
  }

  if (!gated && !hasPublic) return null;

  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
      <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">Contact</h2>

      {hasPublic && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {website && (
            <ContactRow icon={Globe} label="Website">
              <a href={website} target="_blank" rel="noreferrer noopener" className={linkClass}>
                {hostOf(website)}
              </a>
            </ContactRow>
          )}
          {address && (
            <ContactRow icon={MapPin} label="Address">
              {address}
            </ContactRow>
          )}
          {openingHours && (
            <ContactRow icon={Clock} label="Opening hours">
              {/* Free text by design (schema.prisma) — members write one line
                  per day, so the newlines they typed have to survive. */}
              <span className="whitespace-pre-line">{openingHours}</span>
            </ContactRow>
          )}
        </div>
      )}

      {gated && <div className={hasPublic ? "mt-5 border-t border-grey-200 pt-5 dark:border-border" : "mt-3"}>{gated}</div>}
    </div>
  );
}

export { ContactDetails };
