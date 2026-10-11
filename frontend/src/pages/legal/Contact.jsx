import { Link } from "react-router-dom";

import { InfoPage } from "./InfoPage";
import { CONTACT_EMAIL } from "@/lib/site";

function Contact() {
  return (
    <InfoPage eyebrow="Company" title="Contact us">
      <p>
        Email <b>{CONTACT_EMAIL}</b> and we&rsquo;ll get back to you, usually within two business
        days.
      </p>
      <p>
        <b>Want to change your business&rsquo;s listing?</b> Claim it first. Find it in the{" "}
        <Link to="/directory">directory</Link>, open it and choose to claim it. Once your claim
        is approved you can edit or remove its details yourself from your profile.
      </p>
      <p>
        <b>Is your personal data on a listing you don&rsquo;t own?</b> Write to us with a link to
        the listing and we&rsquo;ll look into it. See our <Link to="/privacy">privacy notice</Link>.
      </p>
      <p>
        Many questions are answered in the <Link to="/faq">FAQ</Link>.
      </p>
    </InfoPage>
  );
}

export { Contact };
