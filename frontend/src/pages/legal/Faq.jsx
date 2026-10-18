import { Link } from "react-router-dom";

import { InfoPage } from "./InfoPage";
import { CONTACT_EMAIL } from "@/lib/site";

// Every answer here describes what the product does today. When a flow
// changes (claims, verification, the Founding programme), change its answer.
const QUESTIONS = [
  {
    q: "Why is my business on ABRI? I never signed up.",
    a: (
      <>
        We build the directory from public sources: open map data, government registers and
        businesses&rsquo; own websites. Our <Link to="/privacy">privacy notice</Link> lists them.
        Claim your listing to take control of it.
      </>
    ),
  },
  {
    q: "How do I claim my business?",
    a: (
      <>
        Find it in the <Link to="/directory">directory</Link>, or add it if it isn&rsquo;t there,
        then <Link to="/register">claim it</Link> with your details and the business&rsquo;s SSM
        registration number. If the listing already has an email address, we can send a code
        there and your claim is approved as soon as you enter it. Otherwise our team reviews it.
      </>
    ),
  },
  {
    q: "How long does verification take?",
    a: "We check your SSM registration number against the SSM register by hand, usually within a couple of business days. You can log in and use the directory while you wait.",
  },
  {
    q: "What does it cost?",
    a: (
      <>
        Nothing to join. Businesses approved before launch are Founding members and get the Pro
        plan free during the founding period, then move to the Free plan, which stays free.
        Paid plans are optional. See <Link to="/#pricing">membership</Link>.
      </>
    ),
  },
  {
    q: "Can I pay for the SSM-Verified badge?",
    a: "No. The badge means we checked your registration against the SSM register, and it is the same on every plan. Paying unlocks features, never trust.",
  },
  {
    q: "How do I change or remove my business's details?",
    a: "Claim the listing. Once your claim is approved you can edit or remove the phone number, WhatsApp, email, website, address and other details from your profile.",
  },
  {
    q: "Who can see my phone number and email?",
    a: "Only members who are logged in. Visitors who aren't logged in see the business name, area, address and website.",
  },
  {
    q: "What is an endorsement?",
    a: "A verified business saying publicly that it has worked with you and stands behind you. Endorsements are tied to the endorser's own name, so they can't be bought or faked quietly.",
  },
  {
    q: "My personal data is on a listing I don't own.",
    a: (
      <>
        Write to <b>{CONTACT_EMAIL}</b> with a link to the listing and we&rsquo;ll look into it.
      </>
    ),
  },
];

function Faq() {
  return (
    <InfoPage eyebrow="Help" title="Frequently asked questions">
      {QUESTIONS.map(({ q, a }) => (
        <div key={q}>
          <h2 className="!mt-8">{q}</h2>
          <p className="mt-2">{a}</p>
        </div>
      ))}
    </InfoPage>
  );
}

export { Faq };
