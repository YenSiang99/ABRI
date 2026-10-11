import { LEGAL_DRAFT } from "@/lib/site";

// The frame shared by About, Contact, FAQ, Privacy and Terms: a heading, an
// optional "last updated" line, and readable prose. `legal` adds the draft
// banner while lib/site.js says the text hasn't been reviewed.
function InfoPage({ eyebrow, title, updated, legal = false, children }) {
  return (
    <section className="py-[60px] md:py-[88px]">
      <div className="mx-auto max-w-[760px] px-6">
        <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
          {eyebrow}
        </span>
        <h1 className="mt-3 text-[clamp(30px,4vw,44px)] leading-[1.1] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
          {title}
        </h1>
        {updated && (
          <p className="mt-3 text-sm text-grey-500 dark:text-muted-foreground">Last updated {updated}</p>
        )}
        {legal && LEGAL_DRAFT && (
          <div className="mt-6 rounded-md border border-yellow bg-yellow/10 px-4 py-3 text-sm text-ink dark:text-foreground">
            <b>Draft.</b> This page is awaiting legal review and may change before ABRI launches.
          </div>
        )}
        <div className="info-prose mt-8 space-y-5 text-[16px] leading-relaxed text-grey-600 dark:text-muted-foreground [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 dark:[&_a]:text-foreground [&_b]:text-ink dark:[&_b]:text-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-ink dark:[&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </div>
    </section>
  );
}

export { InfoPage };
