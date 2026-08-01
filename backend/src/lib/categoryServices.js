// Default service tags shown on a profile before the owner customizes them
// — ported from the frontend's mock (data/store/businesses.js) so seeded
// and newly-claimed listings look the same either way.
const CATEGORY_SERVICES = {
  "Accounting & Tax": ["SSM filings", "Tax advisory", "Bookkeeping", "Payroll"],
  "Corporate Secretarial": ["Company incorporation", "Statutory filings", "Compliance advisory"],
  Law: ["Contracts", "Corporate structuring", "Dispute resolution"],
  "IT Consulting": ["Cloud migration", "Systems integration", "IT infrastructure"],
};

export { CATEGORY_SERVICES };