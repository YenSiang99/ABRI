import { useState } from "react";
import { Mail } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The instant claim: a code to the email the listing already has on file.
// Offered only when there is one (codeEmail, masked by the server). Shown in
// two places — ClaimHome for a logged-in claimant, and Register's "check your
// email" screen before they've logged in — which differ only in how the two
// calls are made and what happens once the code is right, so those come in
// as props.
//
// send → { sentTo, code? } (code only in local dev); verify resolves on a
// right code and throws { message, expired } otherwise.
function CodeClaim({ codeEmail, send, verify, onApproved, footnote }) {
  const [stage, setStage] = useState("offer"); // offer → sent
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await send();
      setDevCode(result.code ?? null);
      setStage("sent");
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verify(code);
      await onApproved?.();
    } catch (err) {
      setError(err.message);
      if (err.expired) setStage("offer");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Mail className="h-4 w-4" aria-hidden /> Skip the wait
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        This listing has an email on file: <strong className="text-foreground">{codeEmail}</strong>.
        If you can read that inbox, we'll send it a code and your claim is approved as soon as you
        enter it.
      </p>
      {stage === "offer" ? (
        <button
          type="button"
          onClick={sendCode}
          disabled={busy}
          className={cn(buttonVariants({ variant: "outline" }), "mt-4 px-3 py-2")}
        >
          {busy ? "Sending…" : `Send a code to ${codeEmail}`}
        </button>
      ) : (
        <form onSubmit={verifyCode} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            aria-label="Code from the email"
            className="w-44 rounded-md border border-border bg-background px-3 py-2 font-mono text-base tracking-[0.2em] text-foreground outline-none focus:border-foreground md:text-sm"
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className={cn(buttonVariants({ variant: "default" }), "px-3 py-2")}
          >
            {busy ? "Checking…" : "Claim it"}
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={busy}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Send another
          </button>
        </form>
      )}
      {devCode && stage === "sent" && (
        <p className="mt-3 text-xs text-muted-foreground">
          No mail provider is set up here — the code is <span className="font-mono">{devCode}</span>.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {footnote && <p className="mt-3 text-xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}

export { CodeClaim };
