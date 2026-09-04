import { Link } from "react-router-dom";
import { Radio, Package, MapPin, Eye, Zap, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/app/StatCard";
import { LockedFeature } from "@/components/app/LockedFeature";
import { useAuth } from "@/context/AuthContext";
import { membershipTierAllows } from "@/lib/membershipTiers";
import { nfcTaps } from "@/data/appMockData";
import { toast } from "@/lib/toast";
import { CLAIMED } from "@/lib/verificationLevels";
import { verificationLevelLabel } from "@/lib/trustLabels";

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// Uses whatever host the app is actually running on (Vercel preview/prod
// domain today, abri.my once that's live) rather than a hardcoded domain,
// so the displayed landing URL always matches a link that really works.
function landingHost() {
  return typeof window !== "undefined" ? window.location.host : "abri.my";
}

// The card artwork, shared by the Plus page and the Free preview so the two
// can't drift into showing different objects — the preview's whole job is to
// be the thing that arrives in the post.
//
// Every field on it is REAL, read from the logged-in business. That is what
// makes the preview worth showing at all; a mocked-up card with someone
// else's name on it would sell nothing.
//
// `preview` changes exactly one thing: the bottom-right legend. "TAP TO
// VERIFY" describes a card that exists and is in someone's hand, which is
// false for a Free member — and the card face is the part most likely to be
// screenshotted away from the caption explaining it. The label has to travel
// with the image.
function CardFace({ business, preview = false }) {
  return (
    <div className="relative aspect-[1.586/1] overflow-hidden rounded-3xl border border-foreground/10 bg-foreground p-8 text-background shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-60">
            ABRI · Verified Business Network
          </div>
          <div className="mt-8 text-2xl font-semibold tracking-tight">{business.name}</div>
          <div className="mt-0.5 text-sm opacity-70">{business.category}</div>
          <div className="mt-1 text-xs opacity-50">{business.location}</div>
          {/* The verification level, in sans, on the card FRONT. It used to be
              printed in the footer's mono as "Tier L2" — the typeface reserved
              for billing, a hundred pixels above a mono "Included in Plus"
              chip, which made an earned signal look like a bought one. This
              also makes BusinessProfile.jsx's promise true: verification
              status renders before contact details on every tap. */}
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
            {verificationLevelLabel[business.verificationLevel]}
          </div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
          A
        </div>
      </div>
      <div className="absolute right-8 bottom-6 left-8 flex items-end justify-between font-mono text-[10px] opacity-70">
        <span>SSM {business.ssm}</span>
        {preview ? (
          <span>PREVIEW · NOT YET PRINTED</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3 w-3" /> TAP TO VERIFY
          </span>
        )}
      </div>
    </div>
  );
}

// Shown by all three states of this page — verification lock, plan lock,
// and the real thing — so a member who can't use the card still reads what
// the card is for rather than landing on a bare panel.
function PageHeader() {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Physical trust token
      </div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">Your NFC card</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Every tap leads with verification status, not your job title. Real proof, in someone's hand.
      </p>
    </div>
  );
}

function Card() {
  const { business } = useAuth();

  // Verification lock first, and it wins when both apply — same precedence
  // as the vouches tab in BusinessProfile.jsx. "Finish getting verified" is
  // more useful to someone who can't use the feature either way than "this
  // is on a paid plan", which would only be true after they had.
  if (business.verificationLevel === CLAIMED) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader />
        <div className="mt-8">
          <LockedFeature
            title="NFC card unlocks after SSM verification"
            description="Once our team confirms your SSM registration, your founding-member card ships and taps start showing up here."
          />
        </div>
      </div>
    );
  }

  // Free members get the card SHOWN to them rather than a locked panel — the
  // artwork with their own name on it is a better argument for Plus than a
  // description of it ever was. Same principle as the vouch buttons in
  // components/app/UpgradePrompt.jsx: don't hide the thing you're selling.
  //
  // What they DON'T get is everything below this branch, and the reason is
  // honesty rather than billing:
  //
  //   Status panel  — reads "Active · Founding batch · shipped Jan 2026" and
  //                   a Card ID that is hardcoded for every member. Showing
  //                   that to someone with no card states a fact that is
  //                   simply untrue.
  //   Tap stats     — read frontend/src/data/appMockData.js. Invented. Six
  //                   taps and an 83% conversion rate on a card that was
  //                   never printed is a fabricated record, not a teaser.
  //   Tap history   — same mock.
  //
  // Omitted outright rather than blurred or locked. A blurred number invites
  // the member to believe there IS a number behind it; there isn't one for
  // anybody yet. Don't tease these into view when a real taps table lands —
  // by then a Free member's figures would be a genuine, and genuinely empty,
  // zero, which sells nothing.
  //
  // Note the ordering: the T1 check above wins, so this preview is only ever
  // reached by a verified business. A T1 member has no `ssm`, and the card
  // face would render "SSM null".
  if (!membershipTierAllows(business.membershipTier, "nfcCard")) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader />
        <div className="mt-8 max-w-xl">
          <CardFace business={business} preview />

          <p className="mt-6 text-sm text-muted-foreground">
            This is your card, with your real details on it. Plus gets it printed and posted — one
            tap opens your verified profile, badge and vouch count first, for someone who has never
            heard of ABRI.
          </p>

          {/* Same mono chip and "See tiers" link as
              components/app/LockedFeature.jsx and UpgradePrompt.jsx. Not
              LockedFeature itself: that renders a dashed panel around a lock
              icon, which is the right shape for a shut door and the wrong one
              here, where the point is that the door is see-through. */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Included in Plus
            </span>
            <Link
              to="/app/plan"
              className="text-sm font-semibold text-foreground underline underline-offset-4"
            >
              See tiers →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalTaps = nfcTaps.length;
  const converted = nfcTaps.filter((t) => t.ledToProfileView).length;
  const rate = Math.round((converted / totalTaps) * 100);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <PageHeader />

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <CardFace business={business} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-lg font-semibold text-foreground">Active</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Founding batch · shipped Jan 2026</div>

          <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
            <Row label="Card ID" value="ABRI-0187" mono />
            <Row label="Chip" value="NTAG 424 DNA" />
            <Row label="Landing URL" value={`${landingHost()}/m/${business.id}`} mono />
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button variant="secondary" onClick={() => toast.success("QR fallback downloaded")}>
              <Download className="mr-1.5 h-4 w-4" /> Download QR fallback
            </Button>
            <Button variant="outline" onClick={() => toast("Replacement request sent · RM50")}>
              <Package className="mr-1.5 h-4 w-4" /> Request replacement (RM50)
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total taps" value={totalTaps} hint="Last 7 days" icon={Zap} />
        <StatCard label="Led to profile view" value={converted} hint={`${rate}% conversion`} icon={Eye} />
        <StatCard
          label="Unique locations"
          value={new Set(nfcTaps.map((t) => t.location)).size}
          hint="Klang Valley corridor"
          icon={MapPin}
        />
      </div>

      <div className="mt-10">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tap history</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Recent activity</h2>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {nfcTaps.map((tap) => (
              <li key={tap.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Radio className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{tap.location}</div>
                  <div className="text-xs text-muted-foreground">
                    {tap.device} · {tap.date}
                  </div>
                </div>
                {tap.ledToProfileView ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                    <Eye className="h-3 w-3" /> Viewed profile
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No follow-through</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export { Card };
