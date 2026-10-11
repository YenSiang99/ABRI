import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchFoundingSettings, saveFoundingSettings } from "@/lib/api/admin";
import { toast } from "@/lib/toast";

// The Founding programme's two dates (backend lib/founding.js), on the claims
// screen because claim approval is where they take effect:
//   closes — launch. Claims approved after it are not Founding. Empty = open.
//   Pro ends — when every Founding member's free Pro ends. Empty = not
//              decided yet, so it doesn't end.
const toInput = (iso) => (iso ? iso.slice(0, 10) : "");
// Midnight Malaysia time on the chosen day, so "ends 1 March" means the
// morning of 1 March for the people it applies to.
const fromInput = (value) => (value ? new Date(`${value}T00:00:00+08:00`).toISOString() : null);

function FoundingSettings() {
  const [settings, setSettings] = useState(null);
  const [closesAt, setClosesAt] = useState("");
  const [proEndsAt, setProEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFoundingSettings()
      .then((s) => {
        setSettings(s);
        setClosesAt(toInput(s.closesAt));
        setProEndsAt(toInput(s.proEndsAt));
      })
      .catch(() => setSettings(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const result = await saveFoundingSettings({ closesAt: fromInput(closesAt), proEndsAt: fromInput(proEndsAt) });
      setSettings((s) => ({ ...s, ...result }));
      toast.success(`Saved. ${result.foundingProMembers} Founding member(s) on Pro now end ${proEndsAt || "never"}.`);
    } catch (err) {
      toast.error(err.message);
    }
    setSaving(false);
  }

  if (settings === null) return null;
  if (settings === false) {
    return <p className="mt-6 text-sm text-muted-foreground">Couldn't load the Founding settings.</p>;
  }

  const open = !settings.closesAt || new Date(settings.closesAt) > new Date();
  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-foreground">Founding programme</div>
        <div className="text-xs text-muted-foreground">
          {open ? "Open" : "Closed"} · {settings.foundingMembers} Founding member(s) ·{" "}
          {settings.foundingProMembers} on Founding Pro
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Every claim approved while it's open gets the Founding badge for good and Pro until the end
        date. Changing the end date moves everyone still on Founding Pro.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="text-xs text-muted-foreground">
          Closes (launch)
          <input
            type="date"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Founding Pro ends
          <input
            type="date"
            value={proEndsAt}
            onChange={(e) => setProEndsAt(e.target.value)}
            className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save dates"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Leave a date empty for "not decided yet".</p>
    </div>
  );
}

export { FoundingSettings };
