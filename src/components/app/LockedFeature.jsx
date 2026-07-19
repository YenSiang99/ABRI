import { Lock } from "lucide-react";

function LockedFeature({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export { LockedFeature };
