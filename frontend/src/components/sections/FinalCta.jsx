import { Link } from "react-router-dom";

function FinalCta() {
  return (
    <section id="claim" className="pt-0 pb-[60px] md:pb-[104px]">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="rounded-lg bg-ink px-6 py-12 text-center text-white md:px-12 md:py-[72px]">
          <h2 className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-white">
            Claim your business in five minutes.
          </h2>
          <p className="mx-auto mt-3.5 max-w-[46ch] text-[#a5a198]">
            Free to start. Verified the moment your SSM record checks out.
          </p>
          <div className="mt-2 mb-7 font-mono text-[12.5px] text-[#8a857a]">
            takes ~5 minutes for most directors · no documents required for
            the automatic match
          </div>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-sm border border-transparent bg-yellow px-7 py-[15px] text-base font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
          >
            Claim your business
          </Link>
        </div>
      </div>
    </section>
  );
}

export { FinalCta };