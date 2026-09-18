import { Users } from "lucide-react";

// The public face of a project: what a visitor sees on a profile when the
// businesses involved chose to publish it.
//
// SHARED BY THE PUBLIC PROFILE AND THE OWNER'S OWN PAGE, deliberately, and for
// the same reason EngagementList is shared: the owner's panel says "this is
// what visitors see", and two copies would make that promise false the first
// time one of them was edited.
//
// WHAT IT CANNOT RENDER IS THE POINT. The server sends a shell — title, dates,
// and the businesses that actually joined (publicProjectShell in
// backend/src/lib/projects.js). There is no `detail` and no `updates` in the
// payload at all, under either visibility setting, so nothing here could leak
// the conversation even by accident. If a field ever appears in this component
// that isn't in that serializer, something has gone wrong upstream.

function monthYear(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Period({ project }) {
  const from = monthYear(project.startedOn);
  const to = monthYear(project.completedOn);
  if (!to || to === from) return from;
  return `${from} – ${to}`;
}

function ProjectShellList({ projects, className = "" }) {
  if (!projects || projects.length === 0) return null;

  return (
    <div
      className={`rounded-2xl border border-grey-200 bg-white p-6 dark:border-border dark:bg-card ${className}`}
    >
      <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-foreground">
        Projects
      </h2>
      <p className="mt-1 text-sm text-grey-500 dark:text-muted-foreground">
        Work done alongside other businesses, with the record to show for it.
      </p>

      <ul className="mt-4 divide-y divide-grey-200 dark:divide-border">
        {projects.map((project) => {
          const others = project.participants;
          return (
            <li key={project.id} className="py-4 first:pt-0 last:pb-0">
              <div className="text-sm font-semibold text-ink dark:text-foreground">
                {project.title}
              </div>
              <div className="mt-0.5 text-sm text-grey-500 dark:text-muted-foreground">
                <Period project={project} />
              </div>
              <div className="mt-1.5 flex items-start gap-1.5 text-sm text-ink dark:text-foreground">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-grey-500 dark:text-muted-foreground" />
                <span className="min-w-0">
                  {others.map((p) => p.business.name).join(", ")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { ProjectShellList };
