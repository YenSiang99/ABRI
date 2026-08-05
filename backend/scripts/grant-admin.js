// Promotes an existing account to admin. Run once per new admin — there's
// no admin-management UI, so this (and its revoke counterpart) is the only
// way to grant/remove the isAdmin flag added in
// prisma/migrations/20260805154236_add_account_is_admin.
//
// Usage: node scripts/grant-admin.js someone@example.com [--revoke]
import { prisma } from "../src/prisma.js";

const email = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("Usage: node scripts/grant-admin.js <email> [--revoke]");
  process.exit(1);
}

const account = await prisma.account.update({
  where: { email },
  data: { isAdmin: !revoke },
});

console.log(`${account.email} isAdmin is now ${account.isAdmin}`);
await prisma.$disconnect();
