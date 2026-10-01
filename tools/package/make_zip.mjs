// Builds the app and writes datadiet-submission.zip (source + prebuilt dist, no node_modules, no secrets).
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";

execSync("npm run build", { stdio: "inherit" });
const root = process.cwd();
const SKIP = new Set(["node_modules", ".git", "test-results", "playwright-report", "coverage", "__pycache__", ".vite"]);
const files = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.endsWith(".zip") || name.startsWith(".env")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files["datadiet/" + relative(root, full).split(sep).join("/")] = readFileSync(full);
  }
})(root);
writeFileSync("datadiet-submission.zip", zipSync(files, { level: 9 }));
console.log(`datadiet-submission.zip: ${Object.keys(files).length} files`);
