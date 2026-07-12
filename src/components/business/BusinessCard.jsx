import { Link } from "react-router-dom";

import { VerificationBadge } from "@/components/badge/VerificationBadge";

function BusinessCard({ business }) {
  return (
    <Link
      to={`/business/${business.id}`}
      className="block rounded-lg border border-grey-200 bg-white p-6 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="grid size-12 flex-none place-items-center rounded-xl bg-ink text-lg font-extrabold text-yellow">
          {business.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-extrabold text-ink">
            {business.name}
          </div>
          <div className="mt-[3px] text-[13.5px] text-grey-600">
            {business.category} · {business.location}
          </div>
          <div className="mt-2.5">
            <VerificationBadge tier={business.tier} size="inline" chip />
          </div>
        </div>
      </div>
      <div className="mt-4 text-[13px] text-grey-500">
        {business.vouchCount > 0
          ? `${business.vouchCount} vouches`
          : "No vouches yet"}
      </div>
    </Link>
  );
}

export { BusinessCard };
