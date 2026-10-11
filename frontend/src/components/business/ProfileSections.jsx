import { Link } from "react-router-dom";
import { BadgeCheck, Clock, FileText, Globe, Mail, MapPin, MessageCircle, Phone, Radio, Wrench } from "lucide-react";

import { LockedFeature } from "@/components/app/LockedFeature";
import { ContactRow, GatedContact, PinMap } from "@/components/business/ContactDetails";
import { PortfolioList } from "@/components/business/PortfolioList";
import { TIMELINE_COPY } from "@/components/business/VerificationTimeline";
import { hostOf, linkClass } from "@/lib/contactDisplay";
import { verificationLevelLabel } from "@/lib/trustLabels";
import { formatDate, profileStage } from "@/lib/profileStage";

// THE STANDARD BUSINESS PROFILE, decided 28 Sep 2026: every business — an
// unclaimed seed listing, a claimed one waiting on SSM, a verified member —
// has the same sections in the same order, and an empty one says what it is
// waiting for instead of disappearing. A visitor learns one page, and an owner
// looking at their unclaimed listing sees exactly what claiming fills in.
//
// Two layouts render these same sections, for the user to compare: "cards"
// (each section its own card) and "single" (one card, sections divided by
// rules). `Section` is the only thing that knows which.


function Missing({ children = "Not listed" }) {
  return <span className="text-grey-500 dark:text-muted-foreground">{children}</span>;
}

export function Section({ layout, title, subtitle, children, first = false }) {
  const head = (
    <>
      <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-grey-500 dark:text-muted-foreground">{subtitle}</p>}
    </>
  );
  if (layout === "single") {
    return (
      <section className={first ? "mt-6 border-t border-grey-200 pt-6 dark:border-border" : "mt-8 border-t border-grey-200 pt-6 dark:border-border"}>
        {head}
        <div className="mt-4">{children}</div>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
      {head}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// The one call to action on an unclaimed listing, directly under the facts:
// what claiming gets the owner, not just the word "claim". It replaced the
// header's bare "Claim your business" button (28 Sep 2026), so there is one
// prompt, not two. "Free" is true — the Free plan is RM0 — and the badge is
// deliberately not promised here: SSM verification sits on the paid plans.
export function ClaimStrip({ business }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-yellow/60 bg-yellow/10 p-4">
      <p className="max-w-xl text-sm text-ink dark:text-foreground">
        <span className="font-semibold">Is this your business?</span> Claim it for free to add your phone number,
        services and description, and to correct anything that's wrong.
      </p>
      <Link
        to={`/register?business=${business.id}`}
        className="inline-flex shrink-0 items-center rounded-md bg-yellow px-4 py-2 text-sm font-semibold text-yellow-ink hover:opacity-90"
      >
        Claim this business
      </Link>
    </div>
  );
}

// Who published a registration number, for the "per …" note beside it.
const REGISTRY_LABEL = {
  mdec: "MDEC",
  myprocurement: "MOF myProcurement",
  cidb: "CIDB",
  manual: "ABRI records",
};

// An unclaimed listing's number as a public register published it — said to
// be the register's word, never shown as verified (see registryNumbersFor in
// routes/businesses.js).
function RegistryNumber({ entry }) {
  const by = entry.sources.map((s) => REGISTRY_LABEL[s] ?? s).join(", ");
  return (
    <span>
      <span className="font-mono">Reg. {entry.number}</span>
      <span className="block text-xs text-grey-500 dark:text-muted-foreground">per {by} · not yet verified</span>
    </span>
  );
}

// The three facts a visitor checks first, the same three for everyone.
export function KeyFacts({ business }) {
  const stage = profileStage(business);
  const { ssm, vouchCount } = business;
  const registry = business.registryNumbers?.[0];
  const facts = [
    ["SSM registration",
      stage === "verified" ? (ssm ? `Reg. ${ssm}` : "Verified")
        : stage === "claimed" ? "Pending check"
        : registry ? <RegistryNumber entry={registry} /> : <Missing>Not provided</Missing>,
      stage === "verified" && ssm],
    ["Vouches",
      stage === "verified" ? (vouchCount > 0 ? `${vouchCount} ${vouchCount === 1 ? "peer" : "peers"}` : "No vouches yet") : <Missing>Open once SSM-verified</Missing>],
    ["On ABRI since", formatDate(business.createdAt)],
  ];
  return (
    <div className="mt-6 grid gap-4 border-t border-grey-200 pt-6 dark:border-border sm:grid-cols-3">
      {facts.map(([label, value, mono]) => (
        <div key={label}>
          <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">{label}</div>
          <div className={`mt-1 text-sm text-ink dark:text-foreground ${mono ? "font-mono" : ""}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

export function AboutSection({ layout, business }) {
  const services = business.services ?? [];
  return (
    <Section layout={layout} title="About">
      <div className="grid gap-4">
        <ContactRow icon={FileText} label="Description">
          {business.description ? (
            <span className="leading-relaxed">{business.description}</span>
          ) : (
            <Missing>No description yet</Missing>
          )}
        </ContactRow>
        <ContactRow icon={Wrench} label="Services">
          {services.length ? (
            <span className="mt-1 flex flex-wrap gap-2">
              {services.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-grey-200 bg-surface px-3 py-1 text-sm text-grey-700 dark:border-border dark:bg-secondary dark:text-secondary-foreground"
                >
                  {s}
                </span>
              ))}
            </span>
          ) : (
            <Missing />
          )}
        </ContactRow>
      </div>
    </Section>
  );
}

export function ContactSection({ layout, business, first }) {
  const stage = profileStage(business);
  const { name, website, address, openingHours, lat, lng } = business;
  const hasPin = lat != null && lng != null;
  // Phone, WhatsApp and email reach every logged-in member on every listing,
  // unclaimed ones included (backend lib/contactVisibility.js). On an
  // unclaimed listing they came from public sources, and the line under the
  // section says so. An anonymous visitor gets GatedContact's "log in" row;
  // a listing with none of the three gets "Not listed", like any empty field.
  const gated = (
    <GatedContact business={business} contactLocked={business.contactLocked} contactLockedReason={business.contactLockedReason} />
  );
  const hasGated = Boolean(business.phone || business.whatsapp || business.email);
  const showGatedPlaceholders = !business.contactLocked && !hasGated;

  return (
    <Section layout={layout} title="Contact & location" first={first}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ContactRow icon={Globe} label="Website">
          {website ? (
            <a href={website} target="_blank" rel="noreferrer noopener" className={linkClass}>
              {hostOf(website)}
            </a>
          ) : (
            <Missing />
          )}
        </ContactRow>
        <ContactRow icon={MapPin} label="Address">
          {address || <Missing />}
        </ContactRow>
        <ContactRow icon={Clock} label="Opening hours">
          {openingHours ? <span className="whitespace-pre-line">{openingHours}</span> : <Missing />}
        </ContactRow>
        {showGatedPlaceholders ? (
          <>
            <ContactRow icon={Phone} label="Phone"><Missing /></ContactRow>
            <ContactRow icon={MessageCircle} label="WhatsApp"><Missing /></ContactRow>
            <ContactRow icon={Mail} label="Email"><Missing /></ContactRow>
          </>
        ) : (
          <div className="sm:col-span-2">{gated}</div>
        )}
        {hasPin && <PinMap lat={lat} lng={lng} name={name} className="sm:col-span-2" />}
      </div>
      {stage === "unclaimed" && (
        <p className="mt-5 text-sm text-grey-600 dark:text-muted-foreground">
          {hasGated && "These details come from public sources, not the business. "}
          Wrong or missing info?{" "}
          <Link to={`/register?business=${business.id}`} className={`font-medium text-ink dark:text-foreground ${linkClass}`}>
            Claim this business to fix it
          </Link>{" "}
          — and get verified.
        </p>
      )}
    </Section>
  );
}

// Dated facts, oldest first, starting from the day the listing arrived, and
// ending with the step it is waiting on — so a new listing's record is never
// blank, and it says plainly what hasn't happened yet.
export function VerificationSection({ layout, business }) {
  const stage = profileStage(business);
  const events = business.verificationTimeline ?? [];
  const next =
    stage === "unclaimed"
      ? "Not yet claimed by its owner"
      : stage === "claimed"
        ? "SSM check in progress"
        : null;
  return (
    <Section layout={layout} title="Verification record" subtitle="What changed, and when. Including anything that was later withdrawn.">
      <ol className="space-y-3">
        <TimelineRow date={formatDate(business.createdAt)} text="Listed on ABRI" />
        {events.map((entry) => {
          const revoked = entry.type === "business_verification_revoked";
          const lapsed = !entry.inForce;
          return (
            <TimelineRow
              key={entry.id}
              date={formatDate(entry.at)}
              text={TIMELINE_COPY[entry.type] ?? entry.type}
              struck={lapsed}
              note={
                lapsed
                  ? "no longer in force"
                  : revoked
                    ? `dropped to ${verificationLevelLabel[entry.level] ?? entry.level}`
                    : null
              }
            />
          );
        })}
        {next && <TimelineRow date="Next" text={next} muted />}
      </ol>
    </Section>
  );
}

function TimelineRow({ date, text, note, struck = false, muted = false }) {
  return (
    <li className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 font-mono text-xs text-grey-500 dark:text-muted-foreground">{date}</span>
      <span className="min-w-0">
        <span
          className={
            struck
              ? "text-grey-500 line-through dark:text-muted-foreground"
              : muted
                ? "text-grey-500 dark:text-muted-foreground"
                : "text-ink dark:text-foreground"
          }
        >
          {text}
        </span>
        {note && <span className="ml-2 text-xs text-grey-500 dark:text-muted-foreground">{note}</span>}
      </span>
    </li>
  );
}

export function VouchesSection({ layout, business, VouchCard }) {
  const stage = profileStage(business);
  const { vouchCount = 0, vouchesReceived = [], testimonialsLocked } = business;
  let body;
  if (stage !== "verified") {
    body = (
      <p className="text-sm text-grey-500 dark:text-muted-foreground">
        {stage === "unclaimed"
          ? "Vouches open once this business is claimed and SSM-verified."
          : "Vouches open once this business is SSM-verified."}
      </p>
    );
  } else if (testimonialsLocked && vouchCount > 0) {
    body = (
      <LockedFeature
        title="Written vouches not shown"
        description={`${vouchCount} ${vouchCount === 1 ? "business has" : "businesses have"} vouched for this company. Their written vouches aren't displayed on this profile.`}
      />
    );
  } else if (vouchesReceived.length > 0) {
    body = <div className="grid gap-4 md:grid-cols-2">{vouchesReceived.map((v) => <VouchCard key={v.id} vouch={v} />)}</div>;
  } else {
    body = <p className="text-sm text-grey-500 dark:text-muted-foreground">No vouches yet.</p>;
  }
  return (
    <Section layout={layout} title={`Vouches${stage === "verified" ? ` (${vouchCount})` : ""}`} subtitle="Other verified businesses who have worked with them.">
      {body}
    </Section>
  );
}

export function PortfolioSection({ layout, business }) {
  const entries = business.entries ?? [];
  const top = business.portfolioSummary?.services?.slice(0, 3) ?? [];
  return (
    <Section layout={layout} title="Portfolio" subtitle="Work confirmed by the business on the other side, not self-reported.">
      {entries.length === 0 ? (
        <p className="text-sm text-grey-500 dark:text-muted-foreground">No confirmed work yet.</p>
      ) : (
        <>
          {top.length > 0 && (
            <ul className="space-y-1.5">
              {top.map((g) => (
                <li key={g.service} className="text-sm text-ink dark:text-foreground">
                  <span className="font-semibold">{g.service}</span>
                  <span className="text-grey-500 dark:text-muted-foreground">
                    {" — "}
                    {g.entries} {g.entries === 1 ? "job" : "jobs"} with {g.counterparties}{" "}
                    {g.counterparties === 1 ? "business" : "different businesses"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <PortfolioList
            entries={entries}
            businessName={business.name}
            businessId={business.id}
            className="mt-4 border-t border-grey-200 pt-4 dark:border-border"
          />
        </>
      )}
    </Section>
  );
}

export function CardSection({ layout, business }) {
  const verified = profileStage(business) === "verified";
  return (
    <Section layout={layout} title="ABRI card" subtitle="A tap-to-verify NFC card that shows verification before contact details.">
      {!verified ? (
        <p className="flex items-center gap-2 text-sm text-grey-500 dark:text-muted-foreground">
          <BadgeCheck className="size-4" /> Available once this business is SSM-verified.
        </p>
      ) : (
        <div className="max-w-md">
          <div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl border border-ink/10 bg-ink p-6 text-yellow shadow-lg dark:border-foreground/10 dark:bg-foreground dark:text-background">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-widest opacity-60">ABRI · Verified</div>
                <div className="mt-6 text-xl font-semibold">{business.name}</div>
                <div className="text-xs opacity-70">{business.category}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow text-sm font-bold text-yellow-ink dark:bg-accent dark:text-accent-foreground">
                A
              </div>
            </div>
            <div className="absolute right-6 bottom-5 left-6 flex items-end justify-between font-mono text-[10px] opacity-70">
              <span>{business.ssm ? `SSM ${business.ssm}` : "SSM verified"}</span>
              <span className="inline-flex items-center gap-1.5">
                <Radio className="h-3 w-3" /> TAP TO VERIFY
              </span>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
