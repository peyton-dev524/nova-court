import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([
  ".git",
  ".openai",
  "dist",
  "reports",
  "screenshots",
  "tests",
  "vendor",
]);
const sourceRoots = ["js", "scripts"];

function discoverSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return discoverSourceFiles(target);
    return entry.isFile() && [".js", ".mjs"].includes(extname(entry.name)) ? [target] : [];
  });
}

const files = [
  join(repoRoot, "server.mjs"),
  ...sourceRoots.flatMap((root) => discoverSourceFiles(join(repoRoot, root))),
];
const uniqueFiles = [...new Set(files)].sort();

console.log(`[check] Syntax-checking ${uniqueFiles.length} unique source files`);
for (const file of uniqueFiles) {
  const displayPath = relative(repoRoot, file).replaceAll("\\", "/");
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`[check] Failed: ${displayPath}`);
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }
}
console.log("[check] All source files passed.");
