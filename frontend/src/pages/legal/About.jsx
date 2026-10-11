import { Link } from "react-router-dom";

import { InfoPage } from "./InfoPage";
import { CONTACT_EMAIL } from "@/lib/site";

function About() {
  return (
    <InfoPage eyebrow="Company" title="About ABRI">
      <p>
        ABRI is a business network for Malaysia built on one idea: before you do business with a
        company, you should be able to see that it is real and that others stand behind it.
      </p>
      <p>
        Every business can be found in the directory. A business that claims its listing and
        passes our check against the SSM register earns the <b>SSM-Verified</b> badge, which no
        one can buy. Verified members then vouch for the businesses they have actually worked
        with, so trust on ABRI comes from peers, not from advertising.
      </p>
      <p>
        We are starting in the Klang Valley. Businesses that join before launch become{" "}
        <b>Founding members</b>, with the Pro plan free during the founding period and the
        Founding badge for good.
      </p>
      <p>
        <Link to="/register">Claim your business</Link> or{" "}
        <Link to="/directory">browse the directory</Link>. Questions: <b>{CONTACT_EMAIL}</b>.
      </p>
    </InfoPage>
  );
}

export { About };
