import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import fs from "node:fs";
const url = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DIRECT_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,"");
const prisma = new PrismaClient({ datasourceUrl: url });

// Every test row is prefixed e2e- so teardown can remove exactly what it made.
const P = "e2e-";
const CAST = [
  // id, name, category, location, verificationLevel
  ["asker",  "E2E Asker Sdn Bhd",   "Law",              "Petaling Jaya", "L2"],
  ["t1",     "E2E T1 Answerer",     "Accounting & Tax", "Petaling Jaya", "L1"],
  ["a2",     "E2E Answerer Two",    "Accounting & Tax", "Petaling Jaya", "L2"],
  ["a3",     "E2E Answerer Three",  "Accounting & Tax", "Kuala Lumpur",  "L2"],
  ["a4",     "E2E Answerer Four",   "Accounting & Tax", "Puchong",       "L2"],
  ["a5",     "E2E Answerer Five",   "Accounting & Tax", "Shah Alam",     "L2"],
  ["a6",     "E2E Answerer Six",    "Accounting & Tax", "Subang Jaya",   "L2"],
  ["a7",     "E2E Answerer Seven",  "Accounting & Tax", "Bangsar",       "L2"],
  ["target", "E2E Recommended Co",  "Accounting & Tax", "Petaling Jaya", "L2"],
  ["t0",     "E2E Unclaimed Co",    "Accounting & Tax", "Petaling Jaya", "L0"],
];

const hash = await hashPassword("e2e-password-123");

for (const [key, name, category, location, verificationLevel] of CAST) {
  const id = P + key;
  await prisma.business.upsert({
    where: { id },
    update: { verificationLevel, category, location },
    create: { id, name, category, location, verificationLevel, membershipTier: "free" },
  });
  if (verificationLevel !== "L0") {
    await prisma.account.upsert({
      where: { email: `${id}@e2e.test` },
      update: { businessId: id, claimStatus: "approved", emailVerified: true, passwordHash: hash },
      create: {
        email: `${id}@e2e.test`, phone: "60100000000", name: `${name} Rep`, role: "Owner",
        passwordHash: hash, emailVerified: true, businessId: id,
        claimStatus: "approved", verificationMethod: "manual",
      },
    });
  }
}
console.log(`seeded ${CAST.length} businesses`);
await prisma.$disconnect();
