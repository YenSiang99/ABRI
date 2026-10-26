// Class strings the homepage sections share. The STRUCTURE of the homepage
// (which sections, in what order, what each holds) follows the Oct 2026
// homepage draft (221026_ABRI Homepage Draft v2). The LOOK — type scale,
// spacing, colours, buttons — is the site's own, as it was before the draft:
// these are the same strings the earlier sections spelled out inline.

const CONTAINER = "mx-auto max-w-[1200px] px-6";

// Vertical rhythm between sections, and the block holding a section's label,
// title and intro. A section that follows another plain section takes only the
// bottom padding (SECTION_PB), as the earlier sections did; one that follows a
// band (the stats strip, the white benefits band) takes both.
const SECTION_Y = "py-[60px] md:py-[104px]";
const SECTION_PB = "pb-[60px] md:pb-[104px]";
const SECTION_HEAD = "mb-13 max-w-[640px]";

const EYEBROW = "text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase dark:text-muted-foreground";

const H2 =
  "mt-3 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.022em] text-ink dark:text-foreground";

const LEAD = "mt-3.5 text-[17px] text-grey-600 dark:text-muted-foreground";

const CARD = "rounded-lg border border-grey-200 bg-white p-[30px] dark:border-border dark:bg-card";
const CARD_TITLE = "text-[19px] font-extrabold text-ink dark:text-foreground";
const CARD_BODY = "text-[14.5px] text-grey-600 dark:text-muted-foreground";

// The dashed "Sample" pill on illustrative content.
const SAMPLE_TAG =
  "rounded-full border border-dashed border-grey-300 px-2 py-[3px] font-mono text-[10px] tracking-[0.08em] text-grey-500 uppercase dark:border-border dark:text-muted-foreground";

const BTN =
  "inline-flex items-center justify-center gap-2 rounded-sm border px-[22px] py-[13px] text-[15px] leading-none font-bold transition-all hover:-translate-y-px";

const BTN_PRIMARY = `${BTN} border-transparent bg-yellow text-yellow-ink hover:bg-yellow-hi hover:shadow-md`;

const BTN_OUTLINE = `${BTN} border-grey-300 text-ink hover:bg-surface-2 dark:border-border dark:text-foreground dark:hover:bg-muted`;

// The outline button, for use on a photo or a dark panel.
const BTN_OUTLINE_ON_DARK = `${BTN} border-white/40 text-white hover:border-white hover:bg-white/10`;

export {
  CONTAINER,
  SECTION_Y,
  SECTION_PB,
  SECTION_HEAD,
  EYEBROW,
  H2,
  LEAD,
  CARD,
  CARD_TITLE,
  CARD_BODY,
  SAMPLE_TAG,
  BTN,
  BTN_PRIMARY,
  BTN_OUTLINE,
  BTN_OUTLINE_ON_DARK,
};
