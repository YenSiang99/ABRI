import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { FEATURE_MIN_MEMBERSHIP_TIER, membershipTierAllows, membershipTierLabel } from "@/lib/membershipTiers";

// The upgrade prompt, and the pattern every tier-gated ACTION in the app
// goes through. Distinct from components/app/LockedFeature.jsx, which is
// the other half of the same idea and answers a different question:
//
//   LockedFeature  — a whole SCREEN or panel is shut. The member arrives and
//                    finds a description of what they're missing. Passive.
//   UpgradePrompt  — a single BUTTON stays live and, on click, says what it
//                    costs. The member reached for something specific and
//                    gets an answer about that specific thing.
//
// The affordance staying visible is the mechanism, not an oversight. Hiding
// a Free member's Accept button would leave them with an app that looks
// finished and does less; leaving it in place and pricing it at the moment
// they press it is what makes the limit legible. That does mean every gated
// button here MUST be one the server also refuses — an upgrade prompt in
// front of an ungated route is just a lie with a price on it.
//
// The client-side check is the UX, never the enforcement. The server answers
// 402 with `requiredMembershipTier` on all of these (backend/src/routes/vouches.js);
// this only saves the member a round trip and a toast.

// Per-feature copy, in one place so the same gate reads identically wherever
// it's hit — a member who meets `giveVouch` on a profile page and again in
// the vouch dialog should be told the same thing, not two paraphrases.
//
// Each entry sells the OUTCOME rather than restating the lock. "Vouching is
// part of Plus" is the title's job; the description's job is why anyone
// wants it.
const UPGRADE_COPY = {
  giveVouch: {
    title: "Vouching is part of Plus",
    description:
      "Vouching is how the network works — you stake your reputation on businesses you've actually worked with, and they do the same for you. Plus members can give up to 20 vouches a month.",
  },
  acceptVouch: {
    title: "Publishing vouches is part of Plus",
    description:
      "Someone has vouched for you. Plus is what puts it on your public profile, where it counts towards your vouch level and is the first thing a visitor sees. Free accounts can receive vouches but not publish them.",
  },
  contactDetails: {
    title: "Being reachable is part of Plus",
    description:
      "Your phone, WhatsApp and email stay hidden from other members while you're on Free. Plus publishes them to logged-in members, so someone who finds your profile can act on it.",
  },
  // No `nfcCard` entry: nothing opens a dialog for it. /app/card sells the
  // card by SHOWING it (see pages/app/Card.jsx), so its pitch lives inline
  // on that page. A second copy here would be the drift this map exists to
  // prevent. Add one only if a card ACTION ever needs pricing at click time.
};

// `feature` is a key of FEATURE_MIN_MEMBERSHIP_TIER. Returns everything a call site
// needs to run the pattern:
//
//   allowed  — plain boolean, for the cases that want to render something
//              different rather than intercept a click (a hint line, a
//              disabled-looking variant).
//   guard    — wraps a click handler. Runs it when allowed; opens the
//              prompt when not. This is the usual call site:
//                  onClick={gate.guard(() => setVouchOpen(true))}
//   open/setOpen — the dialog's state, passed straight back via <UpgradePrompt
//              gate={gate} /> somewhere in the same subtree.
//
// Read through useAuth rather than taking a business prop, because every
// call site is asking about the LOGGED-IN member's own plan. A gate keyed on
// someone else's plan is a different question (see BusinessProfile's vouches
// tab) and shouldn't be able to reuse this by accident.
function useUpgradeGate(feature) {
  const { business } = useAuth();
  const [open, setOpen] = useState(false);
  const allowed = membershipTierAllows(business?.membershipTier, feature);

  function guard(action) {
    return (...args) => {
      if (allowed) return action?.(...args);
      setOpen(true);
      return undefined;
    };
  }

  return { feature, allowed, open, setOpen, guard };
}

// Renders nothing until the gate opens it, so it's safe to drop next to the
// button it guards rather than hoisting it to the page root.
function UpgradePrompt({ gate }) {
  const copy = UPGRADE_COPY[gate.feature];
  const plan = membershipTierLabel[FEATURE_MIN_MEMBERSHIP_TIER[gate.feature]];

  // A missing entry means someone added a feature to FEATURE_MIN_MEMBERSHIP_TIER and
  // wired a gate to it without writing the pitch. Rendering an empty dialog
  // would look like a bug in the button; rendering nothing at all makes the
  // button look broken. Neither is worth guessing over, so say it plainly —
  // this only ever fires in development, where the copy is still being
  // written.
  if (!copy) {
    console.warn(`[UpgradePrompt] No copy for feature ${JSON.stringify(gate.feature)}.`);
    return null;
  }

  return (
    <Dialog open={gate.open} onOpenChange={gate.setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* Same squared mono chip as the sidebar's plan label and
              LockedFeature's, for the same reason: it has to read as
              billing, not as a third trust signal beside the verification
              level and the vouch level. See schema.prisma's membershipTier
              comment. */}
          <span className="w-fit rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {plan}
          </span>
          <DialogTitle className="mt-2">{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          {/* "Not now" rather than "Cancel": this dialog interrupted
              something the member was trying to do, and the dismiss should
              read as postponing the pitch, not as abandoning their action. */}
          <Button variant="ghost" onClick={() => gate.setOpen(false)}>
            Not now
          </Button>
          <Button
            render={<Link to="/app/plan" />}
            nativeButton={false}
            onClick={() => gate.setOpen(false)}
          >
            See tiers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook and component ship together, which trips react-refresh/only-export-
// components — the same error the five files in src/context/ already carry
// for the same provider-plus-hook shape. Kept deliberately: the two are one
// pattern (`const gate = useUpgradeGate(...)` then `<UpgradePrompt gate={gate} />`)
// and splitting them would put two import lines at every call site of
// something meant to be reached for often. The cost is dev-time HMR
// granularity in this one file.
export { UpgradePrompt, useUpgradeGate };
