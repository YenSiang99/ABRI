import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { businesses } from "@/data/businesses";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/badge/VerificationBadge";

function BusinessProfile() {
  const { id } = useParams();
  const business = businesses.find((b) => b.id === id);

  if (!business) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-24 text-center">
        <p className="text-grey-600">We couldn't find that business.</p>
        <Link
          to="/directory"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to directory
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 py-16">
      <Link
        to="/directory"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-grey-600 hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Back to directory
      </Link>

      <div className="mt-6 rounded-lg border border-grey-200 bg-white p-8">
        <VerificationBadge tier={business.tier} size="hero" />

        <h1 className="mt-5 text-[28px] font-extrabold tracking-[-0.02em] text-ink">
          {business.name}
        </h1>
        <div className="mt-1.5 text-[14px] text-grey-600">
          {business.category} · {business.location}
        </div>
        <div className="mt-3 text-[13px] text-grey-500">
          {business.vouchCount > 0
            ? `${business.vouchCount} vouches`
            : "No vouches yet"}
        </div>

        <p className="mt-6 text-[15px] leading-relaxed text-grey-700">
          {business.description}
        </p>

        {business.tier === "T0" && (
          <div className="mt-8 rounded-md border border-grey-200 bg-surface p-5">
            <p className="text-sm font-bold text-ink">
              This listing hasn't been claimed yet.
            </p>
            <p className="mt-1 text-[13.5px] text-grey-600">
              Are you the owner? Claim this business to verify it and start
              building your vouch reputation.
            </p>
            <Button
              render={<Link to={`/register?business=${business.id}`} />}
              nativeButton={false}
              className="mt-4 h-auto rounded-sm bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink hover:bg-yellow-hi"
            >
              Claim your business
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export { BusinessProfile };
