const STEPS = [
  {
    title: "Claim",
    description:
      "Enter your SSM number. We pull your official company record — you don't type it, we retrieve it.",
    tag: "SSM 2018·01·019345",
  },
  {
    title: "Verify",
    description:
      "We match you to the registered company and confirm you're authorised to represent it. Directors verify automatically.",
    tag: "✓ director match",
  },
  {
    title: "Connect",
    description:
      "Your verified profile goes live. Be found, share by tap, and build relationships you can prove.",
    tag: "profile · live",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="pt-5 pb-[60px] md:pb-[104px]">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mb-13 max-w-[640px]">
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground">
            How ABRI works
          </span>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground">
            Verified in minutes, not days.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className="rounded-lg border border-grey-200 bg-white p-[30px] transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-border dark:bg-card"
            >
              <span className="mb-[18px] grid size-[26px] place-items-center rounded-full bg-yellow font-mono text-xs font-semibold text-yellow-ink">
                {index + 1}
              </span>
              <h3 className="mb-2 text-[19px] font-extrabold text-ink dark:text-foreground">
                {step.title}
              </h3>
              <p className="text-[14.5px] text-grey-600 dark:text-muted-foreground">{step.description}</p>
              <span className="mt-4 inline-block rounded-[5px] bg-surface-2 px-2.5 py-1 font-mono text-[11.5px] text-grey-500 dark:bg-muted dark:text-muted-foreground">
                {step.tag}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-11 text-center text-[15px] text-grey-500 italic dark:text-muted-foreground">
          Because by the time you've vetted someone the old way, the
          opportunity's usually gone.
        </p>
      </div>
    </section>
  );
}

export { HowItWorks };