// Why a search result came back, in words.
//
// Shared by the in-app directory and the public check screen so the two
// cannot describe the same `matchReason` differently — they are one search
// engine (lib/businessLookup.js on the server) and should read as one.
//
// It exists at all because "the registration number you pasted matched" and
// "the name contains what you typed" are very different degrees of
// confidence. Presenting both with the same weight is how a loose name match
// gets read as confirmation, which on a screen people use before wiring money
// is the failure that matters.
const MATCH_COPY = {
  ssm: "Matched on registration number",
  domain: "Matched on website or email domain",
  name: "Matched on name — check it is the right one",
};

export { MATCH_COPY };
