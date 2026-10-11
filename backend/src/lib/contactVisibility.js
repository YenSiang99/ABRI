// The one place the contact rule is written down: phone, WhatsApp and email
// cross the wire to any LOGGED-IN viewer, on every listing, whatever the
// owner's plan. Anonymous visitors get none of them.
//
// Being logged in is anti-scraping, NOT a paywall — a free account clears it.
// The old rule had a second half, "the owner is on Plus or above", and it was
// dropped on 11 Oct 2026 (ABRI-launch-access-plan.md step 5) for two reasons:
//
//   - The directory is mostly unclaimed listings whose phone and email came
//     from public sources. Behind an owner-plan gate that data reached nobody
//     but admins; open to members, it is the first thing a new signup can
//     actually use.
//   - With the owner half in place, claiming a listing on Free would HIDE the
//     number it showed while unclaimed — claiming would make a business
//     harder to reach, which punishes the thing the product most wants.
//
// There is still NO viewer-plan check, for the reason that has always held:
// charging the buyer to contact a seller paywalls the seller's own leads.
//
// Returns a reason rather than a bare boolean so the profile can say what
// the viewer can do about it ("log in"), and so a future reason has a shape
// to arrive in.
function contactVisibility(business, viewer) {
  if (!viewer) return { visible: false, reason: "viewer_anonymous" };
  return { visible: true, reason: null };
}

export { contactVisibility };
