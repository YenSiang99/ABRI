import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { consumeToken } from "@/lib/store/emailVerifications";
import { useAuth } from "@/context/AuthContext";

// Landing point for the simulated "verification email" link generated in
// Register.jsx's VerifyStep. Consuming the token here — rather than at
// generation time — is what stands in for "the claimant was able to open
// their company inbox and click through," since only someone with access to
// that address could have reached this URL.
function VerifyClaimLink() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { completeDomainVerifiedClaim, completeManualVerifiedClaim } = useAuth();
  const [error, setError] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const consumed = consumeToken(token);
    if (!consumed.ok) {
      setError(consumed.error);
      return;
    }

    const { claimPayload, accountId } = consumed.record;

    // Two shapes depending on which path minted this token (see
    // emailVerifications.js): claimPayload means nothing exists yet
    // (domain-match, minted at submission); accountId means the account and
    // business already exist and are already approved (manual review,
    // minted when an admin approved it) — this is just the final
    // email-ownership confirmation.
    const result = claimPayload
      ? completeDomainVerifiedClaim(claimPayload)
      : completeManualVerifiedClaim({ accountId });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    navigate("/app", {
      replace: true,
      state: { businessName: claimPayload?.businessName },
    });
  }, [token, completeDomainVerifiedClaim, completeManualVerifiedClaim, navigate]);

  if (!error) {
    return (
      <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
        <p className="text-sm text-grey-600 dark:text-muted-foreground">
          Verifying your email…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
      <h1 className="text-xl font-extrabold text-ink dark:text-foreground">
        Verification failed
      </h1>
      <p className="mt-2 text-sm text-grey-600 dark:text-muted-foreground">{error}</p>
      <Link
        to="/register"
        className="mt-6 inline-block text-sm font-bold text-ink underline-offset-2 hover:underline dark:text-foreground"
      >
        Start your claim again
      </Link>
    </div>
  );
}

export { VerifyClaimLink };
