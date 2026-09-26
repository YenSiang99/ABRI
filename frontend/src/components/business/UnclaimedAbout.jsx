import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Clock,
  FileText,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Wrench,
} from "lucide-react";
import { ContactRow, PinMap } from "@/components/business/ContactDetails";
import { hostOf, linkClass } from "@/lib/contactDisplay";

// Everything an unclaimed listing has, as one About section inside the
// profile's header card — and, just as deliberately, everything it DOESN'T
// have. An empty field says so rather than disappearing: a listing that only
// shows what it knows looks finished, and one that shows "Not listed" next to
// Phone is the owner's reason to claim it.
//
// Phone, WhatsApp and email are never imported (ABRI-data-sources.md → Rules),
// and an unclaimed business has nobody to add them, so "Not listed" is the
// truth here rather than a stand-in for a gate. Category and area are left
// out: the header right above already shows both.
function Missing({ children = "Not listed" }) {
  return <span className="text-grey-500 dark:text-muted-foreground">{children}</span>;
}

function UnclaimedAbout({ business }) {
  const { id, name, description, services = [], address, website, openingHours, lat, lng } = business;
  const hasPin = lat != null && lng != null;

  return (
    <section className="mt-6 border-t border-grey-200 pt-6 dark:border-border">
      <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">About</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ContactRow icon={FileText} label="Description">
            {description || <Missing>No description yet</Missing>}
          </ContactRow>
        </div>
        <div className="sm:col-span-2">
          <ContactRow icon={Wrench} label="Services">
            {services.length ? services.join(", ") : <Missing />}
          </ContactRow>
        </div>
        <ContactRow icon={MapPin} label="Address">
          {address || <Missing />}
        </ContactRow>
        <ContactRow icon={Globe} label="Website">
          {website ? (
            <a href={website} target="_blank" rel="noreferrer noopener" className={linkClass}>
              {hostOf(website)}
            </a>
          ) : (
            <Missing />
          )}
        </ContactRow>
        <ContactRow icon={Clock} label="Opening hours">
          {openingHours ? <span className="whitespace-pre-line">{openingHours}</span> : <Missing />}
        </ContactRow>
        <ContactRow icon={Phone} label="Phone">
          <Missing />
        </ContactRow>
        <ContactRow icon={MessageCircle} label="WhatsApp">
          <Missing />
        </ContactRow>
        <ContactRow icon={Mail} label="Email">
          <Missing />
        </ContactRow>
        <ContactRow icon={BadgeCheck} label="SSM registration">
          <Missing>Not provided</Missing>
        </ContactRow>
        {hasPin && <PinMap lat={lat} lng={lng} name={name} className="sm:col-span-2" />}
      </div>

      <p className="mt-6 text-sm text-grey-600 dark:text-muted-foreground">
        Wrong or missing info?{" "}
        <Link to={`/register?business=${id}`} className={`font-medium text-ink dark:text-foreground ${linkClass}`}>
          Claim this business to fix it
        </Link>{" "}
        — and get verified.
      </p>
    </section>
  );
}

export { UnclaimedAbout };
