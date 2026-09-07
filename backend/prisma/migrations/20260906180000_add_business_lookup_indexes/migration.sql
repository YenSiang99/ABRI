-- The first indexes on Business, added with GET /businesses/lookup — the
-- check-a-business screen, which matches a pasted website or email domain
-- against it (see backend/src/lib/businessLookup.js). The registration-number
-- index arrives with its normalized column in the next migration.
--
-- No index for the name search. It is ILIKE '%x%', which a btree cannot
-- serve; that would need pg_trgm and a GIN index, and a sequential scan is
-- correct well past the corridor firm-count this directory is sized for.
CREATE INDEX "Business_domain_idx" ON "Business"("domain");
