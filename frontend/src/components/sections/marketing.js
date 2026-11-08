// Class strings the homepage sections share. Both the STRUCTURE (which
// sections, in what order, what each holds) and, since Nov 2026, the LOOK
// (type scale, spacing, colours, buttons) follow "Homepage v2 (editable)" in
// the Oct 2026 homepage draft: Hanken Grotesk headlines over Manrope body,
// 6px buttons, 8px cards, alternating cream / white / black / gold bands.

// 1200px of content with a 48px gutter on desktop, 24px on a tablet and 20px
// on a phone, as the draft's .container-shell.
const CONTAINER = "mx-auto w-full max-w-[1296px] px-5 sm:px-6 lg:px-12";

// Every section carries its own top and bottom padding, as in the draft.
const SECTION_Y = "py-10 md:py-[72px]";
const SECTION_HEAD = "mb-8";

const EYEBROW =
  "mb-3.5 flex items-center gap-2 text-[12px] font-bold tracking-[0.12em] text-ink uppercase dark:text-foreground";

const H2 =
  "font-display text-[30px] leading-[1.2] font-bold tracking-[-0.02em] text-ink sm:text-[34px] lg:text-[40px] dark:text-foreground";

const LEAD = "mt-3 text-[16px] leading-[1.65] text-grey-600 sm:text-[17px] dark:text-muted-foreground";

const CARD = "rounded-[8px] border border-grey-200 bg-white p-6 dark:border-border dark:bg-card";
const CARD_TITLE = "font-display text-[22px] leading-[1.3] font-semibold tracking-[-0.01em] text-ink dark:text-foreground";
const CARD_BODY = "text-[15px] leading-[1.6] text-grey-600 dark:text-muted-foreground";

// The "Sample" pill on illustrative content.
const SAMPLE_TAG =
  "rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-grey-600 dark:bg-muted dark:text-muted-foreground";

const BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[6px] border px-4 text-[15px] leading-none font-semibold transition-all duration-200 hover:-translate-y-px";

// The large size, for hero and section CTAs.
const BTN_LG = "h-[50px] px-[22px] text-[16px]";

const BTN_PRIMARY = `${BTN} border-transparent bg-yellow text-ink hover:bg-yellow-hi`;

const BTN_OUTLINE = `${BTN} border-grey-200 bg-white text-ink hover:border-ink dark:border-border dark:bg-card dark:text-foreground dark:hover:border-foreground`;

// Inverts in dark mode, where a black button would vanish into the page.
const BTN_DARK = `${BTN} border-transparent bg-ink text-white hover:bg-black dark:bg-white dark:text-ink dark:hover:bg-grey-100`;

// A row of cards that becomes a sideways swipe on a phone, the next card
// peeking in from the right, instead of a tall stack. From 640px up the
// component lays the cards out as its own grid.
const SWIPE_ROW =
  "no-scrollbar max-sm:-mx-5 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:gap-3 max-sm:overflow-x-auto max-sm:scroll-px-5 max-sm:px-5";
const SWIPE_ITEM = "max-sm:w-[84%] max-sm:flex-none max-sm:snap-start";

// The black button with a light rim, for use on the hero photo.
const BTN_DARK_ON_PHOTO = `${BTN} border-white/35 bg-black text-yellow hover:border-white`;

// The small text link under a card ("The ABRI Verified difference ↗").
const TEXT_LINK =
  "inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink hover:underline dark:text-foreground";

export {
  CONTAINER,
  SECTION_Y,
  SECTION_HEAD,
  EYEBROW,
  H2,
  LEAD,
  CARD,
  CARD_TITLE,
  CARD_BODY,
  SAMPLE_TAG,
  BTN,
  BTN_LG,
  BTN_PRIMARY,
  BTN_OUTLINE,
  BTN_DARK,
  BTN_DARK_ON_PHOTO,
  SWIPE_ROW,
  SWIPE_ITEM,
  TEXT_LINK,
};
