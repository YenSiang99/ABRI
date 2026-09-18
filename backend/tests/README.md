# Tests

End-to-end only. Each suite drives the **real API over HTTP** with real
sessions and asserts with `node:assert`. There is no test framework and
nothing is mocked — a suite that passes means the route, the database and the
gates all agreed.

## Running them

They need a live database and a live backend:

```sh
npm run db:start     # Postgres
npm run dev          # the API on :4000
npm test             # all suites, in order
```

One suite on its own, while you're debugging something:

```sh
node tests/lookup.mjs
```

`npm test` seeds fixtures first, runs everything even after a failure, and
prints the failing output at the end. It exits non-zero if any suite failed.

## What's here

| file | covers |
|---|---|
| `fixtures.mjs` | **Not a test.** Seeds the ten `e2e-` businesses every suite assumes |
| `feed.mjs` | the trust feed, and that a retracted source removes its own feed row |
| `ssm-verification.mjs` | submission → review → verified, and that an unverified number stays private |
| `lookup.mjs` | check a business — identifier matching, the honest miss, the rate limit |
| `directory.mjs` | paging, the cap, and the anonymous→member ladder |
| `tiers.mjs` | the Plus and Pro rungs, and that Plus only ever *adds* |
| `portfolio.mjs` | the portfolio record — propose, confirm, and who gets credited for a service |

## Two things about the order

`npm test` handles all of this. It matters if you run files by hand.

1. **`fixtures.mjs` runs first.** Nothing else creates its own businesses.
2. **`lookup.mjs` spends its own rate-limit budget** — its last step fires 40
   anonymous lookups to prove the limiter trips. It waits the 60-second window
   out at the start, so running it twice in a minute is slow but not broken.

## Fixtures

Ten businesses prefixed `e2e-`, all with the password `e2e-password-123`:

- `e2e-primary` (Law, PJ, L2) — the main actor in most suites
- `e2e-t1` (L1) — the only claimed-but-unverified business; used for gate tests
- `e2e-a2` … `e2e-a7` (Accounting & Tax, various locations, L2) — counterparties
- `e2e-target` (L2) — the business that gets vouched for
- `e2e-t0` (L0) — the unclaimed listing

Suites that need an admin create `e2e-admin@e2e.test` themselves. Nothing here
touches a business without the `e2e-` prefix, so your seeded directory and any
real accounts are left alone.
