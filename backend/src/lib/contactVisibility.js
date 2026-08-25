import { can } from "./entitlements.js";

// The one place the contact rule is written down. Two conditions, and they
// exist for two unrelated reasons — which is exactly why this isn't just a
// second entry in entitlements.js:
//
//   1. The OWNER is on plus or above. This is the revenue rule: pay so people
//      can reach you. It's a plan question, so it defers to can().
//   2. The VIEWER is logged in — ANY plan, free included. This is
//      anti-scraping, NOT a paywall. A free account clears it, and that is
//      the point: we never charge the buyer for the privilege of contacting a
//      paying seller. LinkedIn and Alignable both gate reach and insight
//      (InMail, who-viewed-you) rather than identity, for the same reason —
//      a directory whose contacts are unreachable is worth less to the very
//      members who paid to browse it.
//
// There is NO viewer-plan check here. Adding one would invert the business
// model rather than tighten it: it would paywall a paying member's own
// inbound leads away from the free members trying to hire them.
//
// Overrides: the owner always sees their own (they also get them ungated via
// loadAccountView, so this is the public route's version of that), and admins
// always see them — the same ruling accountView.js already makes for billing.
//
// Returns a reason rather than a bare boolean because the two locked states
// are different messages with different calls to action, and only one of them
// names something the viewer can actually do.
function contactVisibility(business, viewer) {
  if (viewer?.isAdmin) return { visible: true, reason: null };
  if (viewer?.businessId && viewer.businessId === business.id) {
    return { visible: true, reason: null };
  }

  // Owner-plan is reported FIRST when both conditions fail. Telling an
  // anonymous visitor to log in, when logging in would still show them
  // nothing, spends the one action we asked of them and teaches them that
  // the prompt lies. Same principle as the tier-beats-plan precedence in the
  // UI: name the blocker that would still be standing after the reader does
  // exactly as they were told.
  //
  // Yes, this lets an anonymous caller infer which businesses are on a free
  // plan. testimonialsLocked in the same payload already leaks precisely
  // that (both gates are "plus"), so it reveals nothing new — noted here so
  // nobody "fixes" it by flipping the order and reintroducing the lying
  // prompt.
  if (!can(business, "contactDetails")) {
    return { visible: false, reason: "owner_plan" };
  }
  if (!viewer) {
    return { visible: false, reason: "viewer_anonymous" };
  }

  return { visible: true, reason: null };
}

export { contactVisibility };
