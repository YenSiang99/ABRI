// The first rate limiter in this codebase, and deliberately the smallest one
// that does the job.
//
// WHY HERE AND NOWHERE ELSE. Every other route is either behind requireAuth
// (a session is the throttle) or is the directory list, which has been public
// since the beginning and is not advertised. GET /businesses/lookup is the
// first endpoint that is BOTH public and promoted — the whole point of the
// check-a-business screen is that strangers use it — so it is the first one
// worth bounding. Applied per-route rather than globally for that reason:
// a global limiter would be a behaviour change to twelve routes nobody asked
// about, decided in a file about one of them.
//
// In-memory, no dependency. That is honest rather than ideal, and the limits
// of it should be stated plainly:
//
//   - It is PER PROCESS. Two backend instances mean two independent budgets.
//     Fine today (one container, one process); the day this is horizontally
//     scaled the counter has to move to Postgres or Redis, and that is the
//     signal to reach for express-rate-limit rather than grow this file.
//   - It resets on deploy. Acceptable: this is anti-scraping friction, not a
//     security control, and nothing behind it is destructive.
//
// req.ip is trustworthy here because index.js sets `trust proxy` for nginx —
// without that every caller would share one bucket and the first scraper
// would lock out the world.

// Fixed window rather than a sliding one or a token bucket. A sliding window
// needs the timestamps kept per key, and a bucket needs a refill clock; a
// fixed window needs two integers. The cost is a burst at a window boundary
// (up to 2x the limit across two adjacent windows), which for a read-only
// lookup is a non-event.
function rateLimit({ windowMs, max, message }) {
  // key -> { count, resetAt }. Swept lazily on read, so an idle process does
  // no work and there is no interval to clean up on shutdown.
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    // The session where there is one, the address otherwise.
    //
    // A logged-in member is already accountable and already able to read this
    // data through GET /businesses — the enumeration this limiter exists to
    // slow down is the anonymous, scripted kind. Keying on the account also
    // stops one member's traffic from spending another's budget when both sit
    // behind the same office NAT, which on a corridor-shaped directory is the
    // normal case rather than the edge one.
    //
    // Requires optionalAuth to have run first; it is declared before this in
    // the route's chain.
    const key = req.account?.id ?? req.ip ?? "unknown";

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // Opportunistic sweep, on the same pass that just wrote. Bounds the map
      // by traffic rather than by a timer: a key that stops being used is
      // dropped the next time ANY key rolls over. Without this the map is a
      // slow leak keyed on every IP that ever called.
      if (hits.size > 1000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      // Retry-After is the half a well-behaved client actually reads; the
      // JSON body is for ours, whose apiFetch renders `error` straight into
      // the UI.
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

export { rateLimit };
