// Remembers, on this device, that someone has signed in to ABRI before.
//
// The homepage uses it to choose its entrance: a first-time visitor gets the
// full top-to-bottom cascade, while someone who has signed in before (and is
// most likely back to search) gets the search bar from the first frame. The
// session itself is an httpOnly cookie the page cannot read, and /auth/me
// answers too late for a first paint, so this flag is what can be known
// synchronously. It survives logout on purpose: a member who signed out is
// still a returning visitor, not a prospect.
//
// Not a security signal: it only picks an animation. Storage can be blocked
// (private windows, strict settings), so every access is guarded and a
// failure reads as "first visit".

const KEY = "abri:signed-in-before";

function hasSignedInBefore() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function markSignedIn() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Storage unavailable: the next visit simply plays the full entrance.
  }
}

export { hasSignedInBefore, markSignedIn };
