import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { loadAppEnv } from "./lib/load-app-env";

// Resolve DATABASE_URL the same way the rest of the app does (.env.local over .env) before
// spawning the child seed process below. `.env` no longer carries DATABASE_URL at all (see
// docs/account-management.md §13.1) so a bare `--require dotenv/config` child (which only loads
// ".env") would otherwise start with no DATABASE_URL. Resolving it here and letting execSync
// inherit process.env means the child's own dotenv/config call becomes a no-op for this key
// (dotenv never overrides an already-set variable), same mechanism as scripts/lib/load-app-env.ts.
loadAppEnv();

try {
  const seedFile = path.resolve(process.cwd(), "scripts/seed.ts");
  const content = fs.readFileSync(seedFile, "utf-8");

  const forbiddenPatterns = [
    /prisma\.\w+\.delete\(/,
    /prisma\.\w+\.deleteMany\(/,
  ];

  const violations = forbiddenPatterns.filter((pattern) => pattern.test(content));

  if (violations.length > 0) {
    console.error("Seed aborted: seed.ts contains prisma.delete or prisma.deleteMany calls.");
    console.error("Remove all delete operations before seeding to avoid deleting production data.");
    console.error("Do not modify this file to bypass this check in development environment as production and deployment database can be shared.");
    process.exit(1);
  }

} catch (err: any) {
}

execSync("tsx --require dotenv/config scripts/seed.ts", { stdio: "inherit" });