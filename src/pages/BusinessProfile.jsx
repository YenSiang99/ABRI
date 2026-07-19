import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Building2, Radio } from "lucide-react";

import { useBusiness, getBusiness } from "@/lib/store/businesses";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VerificationBadge } from "@/components/badge/VerificationBadge";
import { LockedFeature } from "@/components/app/LockedFeature";

function VouchCard({ vouch }) {
  const from = getBusiness(vouch.fromBusinessId);
  return (
    <div className="rounded-2xl border border-grey-200 bg-white p-5 dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-yellow dark:bg-foreground dark:text-background">
          {vouch.fromName.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink dark:text-foreground">{vouch.fromName}</div>
          <div className="text-xs text-grey-500 dark:text-muted-foreground">
            {from ? `${from.category} · ` : ""}
            {vouch.date}
          </div>
        </div>
      </div>
      <blockquote className="mt-4 border-l-2 border-yellow pl-4 text-sm italic text-grey-700 dark:text-foreground">
        "{vouch.testimonial}"
      </blockquote>
    </div>
  );
}

function BusinessProfile() {
  const { id } = useParams();
  const business = useBusiness(id);

  if (!business) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-24 text-center">
        <p className="text-grey-600 dark:text-muted-foreground">We couldn't find that business.</p>
        <Link
          to="/directory"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink hover:underline dark:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to directory
        </Link>
      </div>
    );
  }

  const isUnclaimed = business.tier === "T0";
  const isPendingVerification = business.tier === "T1";
  const { services, vouches, ssm } = business;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        to="/directory"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to directory
      </Link>

      <div className="mt-6 rounded-3xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-2xl font-semibold text-yellow dark:bg-foreground dark:text-background">
              {business.name.charAt(0)}
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                Business profile
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink dark:text-foreground md:text-4xl">
                {business.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-grey-600 dark:text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" /> {business.category}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {business.location}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <VerificationBadge tier={business.tier} size="inline" chip />
              </div>
            </div>
          </div>

          {isUnclaimed && (
            <Button
              render={<Link to={`/register?business=${business.id}`} />}
              nativeButton={false}
            >
              Claim your business
            </Button>
          )}
        </div>

        {!isUnclaimed ? (
          <div className="mt-6 grid gap-4 border-t border-grey-200 pt-6 dark:border-border sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                SSM Record
              </div>
              <div className="mt-1 font-mono text-sm text-ink dark:text-foreground">Reg. {ssm}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                Vouches Received
              </div>
              <div className="mt-1 text-sm text-ink dark:text-foreground">
                {isPendingVerification
                  ? "Unlocks after SSM verification"
                  : business.vouchCount > 0
                    ? `${business.vouchCount} peers`
                    : "No vouches yet"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                Category
              </div>
              <div className="mt-1 text-sm text-ink dark:text-foreground">{business.category}</div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-md border border-grey-200 bg-surface p-5 dark:border-border dark:bg-muted">
            <p className="text-sm font-bold text-ink dark:text-foreground">
              This listing hasn't been claimed yet.
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600 dark:text-muted-foreground">
              Are you the owner? Claim this business to verify it and start
              building your vouch reputation.
            </p>
          </div>
        )}

        {isPendingVerification && (
          <div className="mt-4 rounded-md border border-dashed border-grey-300 bg-surface p-4 dark:border-border dark:bg-muted">
            <p className="text-[13.5px] font-bold text-ink dark:text-foreground">
              Claimed · SSM verification pending
            </p>
            <p className="mt-1 text-[13px] text-grey-600 dark:text-muted-foreground">
              This business was recently claimed by its owner. We're manually
              verifying it against SSM records — vouches and the NFC card
              unlock once that's complete.
            </p>
          </div>
        )}
      </div>

      {!isUnclaimed && (
        <Tabs defaultValue="overview" className="mt-8">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="vouches">
              Vouches ({isPendingVerification ? 0 : vouches.length})
            </TabsTrigger>
            <TabsTrigger value="card">NFC Card</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
              <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">About</h2>
              <p className="mt-3 text-sm leading-relaxed text-grey-600 dark:text-muted-foreground">
                {business.description}
              </p>
            </div>
            {services.length > 0 && (
              <div className="rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
                <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">Services</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {services.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-grey-200 bg-surface px-3 py-1 text-sm text-grey-700 dark:border-border dark:bg-secondary dark:text-secondary-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="vouches" className="mt-6 grid gap-4 md:grid-cols-2">
            {isPendingVerification ? (
              <div className="md:col-span-2">
                <LockedFeature
                  title="Vouches locked"
                  description="Vouches unlock once this business is SSM-verified."
                />
              </div>
            ) : vouches.length > 0 ? (
              vouches.map((v) => <VouchCard key={v.id} vouch={v} />)
            ) : (
              <p className="text-sm text-grey-500 dark:text-muted-foreground">No vouches yet.</p>
            )}
          </TabsContent>

          <TabsContent value="card" className="mt-6">
            {isPendingVerification ? (
              <LockedFeature
                title="NFC card locked"
                description="The physical trust token unlocks once this business is SSM-verified."
              />
            ) : (
              <div className="rounded-3xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card">
                <div className="text-xs font-medium uppercase tracking-wider text-grey-500 dark:text-muted-foreground">
                  Physical trust token
                </div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink dark:text-foreground">
                  Verified via NFC
                </h2>
                <p className="mt-2 text-sm text-grey-600 dark:text-muted-foreground">
                  This business carries an ABRI card. Verification status renders before contact
                  details on every tap.
                </p>

                <div className="mt-6 max-w-md">
                  <div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl border border-ink/10 bg-ink p-6 text-yellow shadow-lg dark:border-foreground/10 dark:bg-foreground dark:text-background">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-widest opacity-60">
                          ABRI · Verified
                        </div>
                        <div className="mt-6 text-xl font-semibold">{business.name}</div>
                        <div className="text-xs opacity-70">{business.category}</div>
                      </div>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow text-sm font-bold text-yellow-ink dark:bg-accent dark:text-accent-foreground">
                        A
                      </div>
                    </div>
                    <div className="absolute right-6 bottom-5 left-6 flex items-end justify-between font-mono text-[10px] opacity-70">
                      <span>SSM {ssm}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Radio className="h-3 w-3" /> TAP TO VERIFY
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export { BusinessProfile };
