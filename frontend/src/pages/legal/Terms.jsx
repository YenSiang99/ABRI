import { Link } from "react-router-dom";

import { InfoPage } from "./InfoPage";
import { CONTACT_EMAIL, COMPANY_LEGAL_NAME } from "@/lib/site";

// A DRAFT for legal review (lib/site.js LEGAL_DRAFT). Each section describes
// a rule the product already enforces — claims, verification, endorsements, the
// Founding programme, plans — so the terms and the software say the same
// thing. Change both together.
function Terms() {
  return (
    <InfoPage eyebrow="Legal" title="Terms of use" updated="12 October 2026" legal>
      <p>
        These terms apply to everyone who uses ABRI, which is operated by {COMPANY_LEGAL_NAME}.
        By creating an account or using the site you agree to them.
      </p>

      <h2>1. Who can join</h2>
      <p>
        ABRI is for businesses in Malaysia. To claim a business you must be its owner or be
        authorised to represent it, and the details you give us, including its SSM registration
        number, must be true.
      </p>

      <h2>2. Listings</h2>
      <p>
        Many listings are compiled from public sources (see our{" "}
        <Link to="/privacy">privacy notice</Link>) and may be out of date or incomplete. A listing
        is not a recommendation by ABRI, and an unclaimed listing has not been checked by us. To change a
        listing, its owner claims it and edits it from their profile.
      </p>

      <h2>3. Claims and verification</h2>
      <ul>
        <li>
          We review claims. We may approve a claim when the business confirms it by a code sent
          to the email address on its listing, or after our own review.
        </li>
        <li>
          &ldquo;SSM-Verified&rdquo; means we checked the registration number against the SSM
          register. It is earned, never sold.
        </li>
        <li>
          We may reject a claim, or later remove a claim or a verification, if the information
          turns out to be false or the claimant is not authorised. If two people claim the same
          business, we decide which claim to approve.
        </li>
      </ul>

      <h2>4. Endorsements and testimonials</h2>
      <p>
        An endorsement says you have done business with another member and stand behind them. Endorse only
        businesses you know, and keep testimonials honest. Endorsements are published under your
        business&rsquo;s name. We may remove endorsements that are false, traded or abusive.
      </p>

      <h2>5. Membership plans</h2>
      <ul>
        <li>
          <b>Founding members.</b> Businesses approved before ABRI launches are Founding members.
          They get the Pro plan free until a date we announce, keep the Founding badge
          permanently, and then move to the Free plan unless they choose a paid plan, at a
          founding discount.
        </li>
        <li>
          <b>Paid plans</b> run for a year. If you pay before your SSM registration is verified,
          your year starts on the day it is verified.
        </li>
        <li>
          Paying for a plan never buys a verification level or endorsements. We may change plans and
          prices; changes apply from your next renewal.
        </li>
      </ul>

      <h2>6. Using contact details and the directory</h2>
      <p>
        Members can see the phone numbers and email addresses businesses publish. Use them to do
        business, not to send bulk or unsolicited marketing. Do not copy, scrape or resell
        directory data, or use automated tools to collect it.
      </p>

      <h2>7. Your content</h2>
      <p>
        You are responsible for what you put on your profile, in endorsements and in messages. You
        allow us to show it on ABRI. Do not post anything unlawful, misleading or that belongs to
        someone else.
      </p>

      <h2>8. Ending your account</h2>
      <p>
        You can ask us to close your account at any time. We may suspend or close accounts that
        break these terms.
      </p>

      <h2>9. Liability</h2>
      <p>
        ABRI helps you find and assess businesses; it does not guarantee them. Decisions to do
        business with anyone are yours. To the extent the law allows, we are not liable for
        losses arising from dealings between members or from reliance on listing information.
      </p>

      <h2>10. Law and contact</h2>
      <p>
        These terms are governed by the laws of Malaysia. We may update them and will show the
        date of the latest version above. Questions: <b>{CONTACT_EMAIL}</b>.
      </p>
    </InfoPage>
  );
}

export { Terms };
