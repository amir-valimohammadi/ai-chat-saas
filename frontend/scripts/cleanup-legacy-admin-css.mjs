import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const stylesDir = path.join(root, "styles");
const legacyFiles = [
  "super-admin-dashboard.css",
  "super-admin-customers.css",
  "super-admin-customer-detail.css",
  "super-admin-sites.css",
  "super-admin-plans.css",
  "super-admin-subscriptions.css",
  "super-admin-ai-monitoring.css",
  "super-admin-audit-logs.css",
  "super-admin-requests.css",
];

let removed = 0;
for (const file of legacyFiles) {
  const target = path.join(stylesDir, file);
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target);
  removed += 1;
  console.log(`Removed legacy stylesheet: styles/${file}`);
}

if (removed === 0) {
  console.log("No legacy Super Admin stylesheets were found.");
} else {
  console.log(`Removed ${removed} legacy stylesheet(s).`);
}
