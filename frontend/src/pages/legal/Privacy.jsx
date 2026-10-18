import { Link } from "react-router-dom";

import { InfoPage } from "./InfoPage";
import { CONTACT_EMAIL, COMPANY_LEGAL_NAME } from "@/lib/site";

// A DRAFT for legal review (lib/site.js LEGAL_DRAFT). Written to describe
// what the product actually does as of Oct 2026 — if a feature changes what
// is collected or who sees it, this page changes with it. Malaysia's
// Personal Data Protection Act 2010 is the frame: notice, purpose, who it is
// disclosed to, access and correction, and who to contact.
function Privacy() {
  return (
    <InfoPage eyebrow="Legal" title="Privacy notice" updated="12 October 2026" legal>
      <p>
        ABRI is a directory and trust network for businesses in Malaysia, operated by{" "}
        {COMPANY_LEGAL_NAME} (&ldquo;ABRI&rdquo;, &ldquo;we&rdquo;). This notice explains what
        personal data we hold, where it comes from, what we use it for and who can see it, as
        required by the Personal Data Protection Act 2010.
      </p>

      <h2>1. Business listings from public sources</h2>
      <p>
        Most listings in the directory were not created by the business. We compile them from
        sources that publish business information openly:
      </p>
      <ul>
        <li>open map data (Overture Maps Foundation and OpenStreetMap contributors);</li>
        <li>
          public government registers and open data, such as DBKL trade licences, CIDB contractor
          registrations, myProcurement contract awards, JAKIM halal certifications, MOTAC
          licences, MDEC listings and data.gov.my;
        </li>
        <li>the business&rsquo;s own website, where it publishes how to contact it.</li>
      </ul>
      <p>
        A listing may hold the business&rsquo;s name, category, address, map location, opening
        hours, website, and published phone number, WhatsApp number and email address. We also
        keep a record of which source said what, including any registration number a public
        register lists. Where a business is run by an individual, such as a sole proprietor,
        some of this may be personal data.
      </p>
      <p>
        <b>Who can see it.</b> Anyone can see a listing&rsquo;s name, category, area, address,
        website and opening hours. Phone numbers, WhatsApp numbers and email addresses are shown
        only to members who are logged in. Registration numbers from public sources are used for
        our own checks and are not shown on the listing.
      </p>
      <p>
        <b>Correcting a listing.</b> The owner of a business can claim its listing and then edit
        or remove these details from their profile. If you are not the owner but a listing
        holds your personal data, write to us (section 8).
      </p>

      <h2>2. When you create an account or claim a business</h2>
      <p>We collect:</p>
      <ul>
        <li>your name, email address, phone number and role in the business;</li>
        <li>a password, which we store only in a scrambled (hashed) form we cannot read back;</li>
        <li>
          the business you claim and the SSM registration number you give us, which we check
          against the SSM register;
        </li>
        <li>anything you add to your business profile.</li>
      </ul>
      <p>
        We use this to run your account, to check that you are authorised to represent the
        business, and to contact you about your account and claim. Your SSM registration number
        is shown on your public profile only after we have verified it.
      </p>

      <h2>3. Claim codes and emails we send</h2>
      <p>
        If you claim a listing that already has an email address on file, we can send a one-time
        code to that address so the business can confirm the claim. We also send emails to
        confirm your address, to tell you the outcome of a claim, and about activity on your
        account. Emails are delivered through an email service provider acting on our behalf.
      </p>

      <h2>4. What you do on ABRI</h2>
      <p>
        We record activity that the product is built on: endorsements you give and receive and their
        testimonials, connections and follows, businesses you check or watch, and which
        businesses open your profile. Some of this is visible to others by design:
      </p>
      <ul>
        <li>published endorsements and testimonials appear on both businesses&rsquo; profiles;</li>
        <li>
          when you open a business&rsquo;s profile, that business can see that it was viewed.
          Members on plans that include it can see which business viewed them, unless the
          viewer has turned on private browsing in their settings;
        </li>
        <li>verification changes appear in the network&rsquo;s trust feed.</li>
      </ul>

      <h2>5. Cookies and your browser</h2>
      <p>
        We use one cookie to keep you logged in. We store a few preferences, such as light or
        dark theme, in your browser. We do not use advertising or third-party tracking cookies.
      </p>

      <h2>6. Who we share data with</h2>
      <p>
        We do not sell personal data. We share it only with service providers that run ABRI for
        us (hosting and email delivery), under their obligations to protect it, and where the law
        requires us to.
      </p>

      <h2>7. How long we keep it</h2>
      <p>
        We keep account data while your account is open and for a reasonable period afterwards
        to meet legal and record-keeping obligations. Listing data from public sources is kept
        while the listing is in the directory, and refreshed from those sources from time to
        time.
      </p>

      <h2>8. Your rights, and how to contact us</h2>
      <p>
        You may ask us what personal data we hold about you, ask us to correct it, or withdraw
        your consent to our processing it. Write to <b>{CONTACT_EMAIL}</b>. We will reply within
        21 days. If you are not satisfied with our reply, you may contact the Personal Data
        Protection Commissioner of Malaysia.
      </p>
      <p>
        See also our <Link to="/terms">Terms of use</Link>.
      </p>
    </InfoPage>
  );
}

export { Privacy };
