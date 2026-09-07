import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

// "They aren't on ABRI (yet) — here's how to fix that."
//
// Shared by the public check-a-business screen and the in-app directory,
// because both reach the same dead end from different directions: a member
// searched for a counterparty and ABRI has no useful row for them. At current
// membership that is the COMMON outcome, not the edge case, which is why the
// invite is a component rather than a line of fallback text.
//
// TWO SHAPES, decided by whether a listing exists:
//
//   businessId set  — the listing is here but unclaimed. The reader might be
//                     its owner, so they get "Claim this business" as well.
//   businessId null — no row at all. Only the invite, and the link carries
//                     the name so the recipient doesn't retype it.
//
// PLAIN TEXT, COPIED BY HAND, and that is deliberate rather than lazy.
// lib/mailer.js exists but Resend is still on the sandbox sender (it delivers
// only to the API key owner), and sendVerificationEmail interpolates straight
// into HTML with no escaping — so a member-supplied company name in an email
// template is an injection surface. Until there is a real pipe, the member's
// own WhatsApp is both safer and what they would have used anyway.
function inviteMessage(name, url) {
  return `Hi — I use ABRI to check who I'm dealing with before we work together. ${name} isn't verified there yet. You can claim your listing here: ${url}`;
}

function InviteToClaim({ name, businessId = null }) {
  const [copied, setCopied] = useState(false);

  // ?business= pre-fills the claim from a real listing and skips the search
  // step; ?name= carries just the name for a business with no row. Both are
  // read by Register.jsx.
  const url = businessId
    ? `${window.location.origin}/register?business=${businessId}`
    : `${window.location.origin}/register?name=${encodeURIComponent(name)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteMessage(name, url));
      setCopied(true);
      toast.success("Invite copied", { description: "Paste it into WhatsApp or an email." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access needs a secure context and a user gesture, and a
      // browser can still refuse. The message is rendered below regardless
      // and is `select-all`, so the fallback is "select it yourself" rather
      // than a dead end.
      toast.error("Couldn't copy automatically — select the message below instead.");
      setCopied(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {/* The owner's own path, and the reason this is here at all: searching
            your own company name is one of the commonest things anyone will
            do on this screen, and until now it offered only a message written
            for sending to somebody else. CardTap.jsx has said "Are you the
            owner? Claim it" on a T0 card since long before this existed. */}
        {businessId && (
          <Button render={<Link to={`/register?business=${businessId}`} />} nativeButton={false}>
            Claim this business
          </Button>
        )}
        <Button onClick={handleCopy} variant="outline">
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? "Copied" : "Copy invite message"}
        </Button>
      </div>
      <p className="mt-3 select-all rounded-md border border-grey-200 bg-surface p-3 text-[13px] text-grey-600 dark:border-border dark:bg-muted dark:text-muted-foreground">
        {inviteMessage(name, url)}
      </p>
    </div>
  );
}

// The sentence that stops a miss from being read as a verdict.
//
// THE MOST IMPORTANT COPY IN THE PRODUCT, and the reason it lives in one
// shared component rather than being written twice: ABRI has no SSM registry
// access, so an empty result says nothing whatsoever about whether a business
// is real. Without this paragraph a reader takes "no record" as a judgement,
// and ABRI would be implying something about a company it has never checked
// and cannot check. Two copies of it is one copy that eventually gets
// softened.
function NoRecordPanel({ query }) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-grey-300 bg-white p-6 dark:border-border dark:bg-card md:p-8">
      <p className="text-lg font-semibold text-ink dark:text-foreground">
        No record of &ldquo;{query}&rdquo; on ABRI.
      </p>
      <p className="mt-2 max-w-xl text-sm text-grey-600 dark:text-muted-foreground">
        That is not a judgement about them. ABRI can only tell you about its own members — this is
        not a check against the SSM register, and plenty of real businesses simply aren&rsquo;t here
        yet.
      </p>
      <p className="mt-4 max-w-xl text-sm text-grey-600 dark:text-muted-foreground">
        If you deal with them, invite them to claim a listing. Then the next person who checks gets
        a real answer — and so do you, next time.
      </p>
      <InviteToClaim name={query} />
    </div>
  );
}

export { InviteToClaim, NoRecordPanel, inviteMessage };
