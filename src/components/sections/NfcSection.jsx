function NfcSection() {
  return (
    <section className="py-[60px] md:py-[104px]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-11 px-6 md:grid-cols-[0.95fr_1.05fr] md:gap-16">
        <div>
          <div className="relative mx-auto h-[300px] w-[360px]">
            <div className="absolute top-4 left-0 z-1 flex h-[182px] w-[300px] -rotate-6 flex-col justify-between rounded-lg border border-black bg-linear-to-br from-[#1d1c19] to-ink p-[22px] text-[#f3f1ec] shadow-md">
              <div>
                <div className="font-mono text-[9px] tracking-[0.16em] text-[#7d7970] uppercase">
                  Verified business network
                </div>
                <div className="mt-2 text-[19px] font-extrabold">
                  Meridian
                  <br />
                  Accounting
                </div>
              </div>
              <div className="flex items-end justify-between">
                <span className="font-mono text-[10.5px] text-[#7d7970]">
                  tap to verify ›››
                </span>
                <span className="text-sm font-extrabold">
                  <b className="mr-1 rounded-[4px] bg-yellow px-[5px] text-ink">
                    A
                  </b>
                  ABRI
                </span>
              </div>
            </div>
            <span className="absolute top-[150px] left-[196px] z-3 size-9 animate-ping rounded-full border-2 border-yellow" />
            <div
              aria-hidden="true"
              className="absolute right-0 bottom-0 z-2 w-[170px] rounded-[22px] border border-grey-300 bg-white p-3.5 px-3 shadow-md"
            >
              <div className="mx-auto mb-3 h-[5px] w-11 rounded-full bg-grey-200" />
              <div className="flex items-center gap-2">
                <div className="grid size-[26px] place-items-center rounded-[7px] bg-ink text-[11px] font-extrabold text-yellow">
                  M
                </div>
                <div className="text-[11px] font-extrabold">
                  Meridian Accounting
                </div>
              </div>
              <div className="mt-2.5 rounded-md border border-yellow bg-yellow-soft px-[7px] py-[5px] font-mono text-[8.5px] text-yellow-ink">
                ✓ SSM-VERIFIED · ACTIVE
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-2" />
              <div className="mt-2 h-1.5 rounded-full bg-surface-2" />
              <div className="mt-2 h-1.5 w-3/5 rounded-full bg-surface-2" />
            </div>
          </div>
          <p className="mt-4 text-center font-mono text-[11.5px] text-grey-500">
            [ replace with product photography before launch ]
          </p>
        </div>

        <div>
          <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase">
            The card
          </span>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-ink">
            One tap. Your whole verified identity.
          </h2>
          <p className="mt-3.5 max-w-[34rem] text-[17px] text-grey-600">
            Tap your ABRI card to any phone — no app needed. They instantly
            see your verified company, your vouches, and your live SSM
            status. Verification renders first, before contact details. It's
            the business card that proves itself.
          </p>
          <div className="mt-[26px]">
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-ink px-[22px] py-[13px] text-[15px] leading-none font-bold text-white transition-colors hover:bg-black"
            >
              See membership
            </a>
            <span className="mt-3 block font-mono text-xs text-grey-500">
              card included with membership
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export { NfcSection };