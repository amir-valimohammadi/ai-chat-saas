import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const globalsPath = path.join(root, "app", "globals.css");
const rootLayoutPath = path.join(root, "app", "layout.tsx");
const adminLayoutPath = path.join(root, "app", "super-admin", "layout.tsx");
const adminStylesDir = path.join(root, "styles", "super-admin");

const failures = [];
const globals = fs.readFileSync(globalsPath, "utf8");
const rootLayout = fs.readFileSync(rootLayoutPath, "utf8");
const adminLayout = fs.readFileSync(adminLayoutPath, "utf8");

const forbiddenInGlobals = [
  /\.sa-[a-z0-9_-]+/i,
  /\.ann-admin-[a-z0-9_-]+/i,
  /\.admin-(?:form|mini|clean|info|copy|hint|result|two-col)[a-z0-9_-]*/i,
  /\.request-(?:stats|stat|filter|list|table|detail|person|purpose|status|priority|date|open|pagination|event|info|note|timeline|manage|meta|website|description|contact|method|whatsapp)[a-z0-9_-]*/i,
  /\.platform-[a-z0-9_-]+/i,
  /\.ops-[a-z0-9_-]+/i,
];

for (const pattern of forbiddenInGlobals) {
  if (pattern.test(globals)) {
    failures.push(`Admin selector still exists in app/globals.css: ${pattern}`);
  }
}

const cssImports = [...rootLayout.matchAll(/import\s+["']([^"']+\.css)["'];/g)].map((match) => match[1]);
const duplicates = cssImports.filter((item, index) => cssImports.indexOf(item) !== index);
if (duplicates.length > 0) {
  failures.push(`Duplicate CSS imports in app/layout.tsx: ${[...new Set(duplicates)].join(", ")}`);
}

if (/super-admin/i.test(rootLayout)) {
  failures.push("Super Admin CSS must not be imported from app/layout.tsx.");
}

if (!fs.existsSync(adminStylesDir)) {
  failures.push("Missing frontend/styles/super-admin directory.");
} else {
  const required = [
    "shared.css",
    "dashboard.css",
    "customers.css",
    "customer-detail.css",
    "customer-create.css",
    "sites.css",
    "plans.css",
    "subscriptions.css",
    "ai-monitoring.css",
    "audit-logs.css",
    "requests.css",
    "announcements.css",
    "system-health.css",
  ];
  for (const file of required) {
    if (!fs.existsSync(path.join(adminStylesDir, file))) {
      failures.push(`Missing admin stylesheet: styles/super-admin/${file}`);
    }
    if (!adminLayout.includes(`styles/super-admin/${file}`)) {
      failures.push(`Admin layout does not import ${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("CSS architecture check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("CSS architecture check passed.");
