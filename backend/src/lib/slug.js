import { prisma } from "../prisma.js";

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Business.id is the slug itself (see schema.prisma), so a collision has to
// be resolved before create rather than left to the database to reject.
async function uniqueBusinessId(name) {
  const base = slugify(name) || "business";
  const existing = await prisma.business.findUnique({ where: { id: base } });
  if (!existing) return base;
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export { slugify, uniqueBusinessId };