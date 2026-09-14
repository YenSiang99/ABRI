// The square tile at the left of a business row, LinkedIn-style.
//
// INITIALS, NOT A LOGO, because there is no logo to show: uploads need file
// storage and an upload route, neither of which exists (see "Full business
// page" in the feature checklist). This is the fallback shape, built so the
// logo can drop into the same box later without the rows relaying out — which
// is the whole reason the tile is a fixed square rather than sized by content.
//
// One neutral tile for every business, not a colour hashed from the name. A
// per-business tint reads as brand — a thing the business chose — and this is
// a placeholder ABRI picked for them. Grey says "no logo yet" honestly; a
// generated colour quietly invents an identity, and every business that later
// uploads a real logo would appear to change theirs.
const SUFFIXES = [
  "sdn bhd",
  "sdn. bhd.",
  "bhd",
  "berhad",
  "enterprise",
  "trading",
  "holdings",
  "group",
  "plt",
];

// Strip the legal suffix before taking initials, or half the directory reads
// "SB" — "Sentul Legal Sdn Bhd" has to give S·L, not S·B. Matched on the tail
// only, so a business genuinely called "Berhad Coffee" keeps its first word.
function initialsFor(name) {
  if (!name) return "?";
  let trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix)) {
      trimmed = trimmed.slice(0, trimmed.length - suffix.length).trim();
      break;
    }
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return name.trim()[0]?.toUpperCase() ?? "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const SIZES = {
  sm: "size-10 text-xs",
  md: "size-12 text-sm",
};

function BusinessAvatar({ name, size = "md", className = "" }) {
  return (
    <span
      // aria-hidden: the business name is always rendered beside this as real
      // text, so announcing the initials as well reads the name twice.
      aria-hidden="true"
      className={
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-grey-100 font-semibold tracking-wide text-grey-600 select-none dark:bg-muted dark:text-muted-foreground " +
        (SIZES[size] ?? SIZES.md) +
        (className ? " " + className : "")
      }
    >
      {initialsFor(name)}
    </span>
  );
}

export { BusinessAvatar };
