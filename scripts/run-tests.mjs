import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsRoot = join(repoRoot, "tests");

function discoverTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return discoverTestFiles(target);
    return entry.isFile() && entry.name.endsWith(".test.mjs") ? [target] : [];
  });
}

const allTests = [...new Set(discoverTestFiles(testsRoot))].sort();
const labTests = new Set([
  "basketball_jersey_wizard.test.mjs",
  "basketball_shoe_styles.test.mjs",
  "cpu_decision_system.test.mjs",
  "dribble_animation_lab.test.mjs",
  "gym_lab.test.mjs",
  "player_anatomy_customization.test.mjs",
  "player_model_harness.test.mjs",
  "shoe_lab.test.mjs",
]);
const smokeTests = new Set([
  "basketball_jersey_wizard.test.mjs",
  "ai_shooting.test.mjs",
  "ball_selection.test.mjs",
  "game.test.mjs",
  "gym_lab.test.mjs",
  "player_model_harness.test.mjs",
  "shooting_assist.test.mjs",
  "three_point_contest.test.mjs",
]);
const supportTests = new Set([
  ...labTests,
  "announcer_director.test.mjs",
  "announcer_runtime.test.mjs",
  "basketball_shorts.test.mjs",
  "basketball_visuals.test.mjs",
  "park_visuals.test.mjs",
  "performance_profile.test.mjs",
  "presentation_director.test.mjs",
  "scene_group_loader.test.mjs",
]);

const group = process.argv[2] ?? "full";
const filters = {
  full: () => true,
  gameplay: (file) => !supportTests.has(file),
  labs: (file) => labTests.has(file),
  smoke: (file) => smokeTests.has(file),
};

if (!filters[group]) {
  console.error(`Unknown test group "${group}". Expected: ${Object.keys(filters).join(", ")}.`);
  process.exit(2);
}

const selected = allTests.filter((path) => filters[group](path.split(/[\\/]/).at(-1)));
if (!selected.length) {
  console.error(`Test group "${group}" selected no files.`);
  process.exit(2);
}

const displayPaths = selected.map((path) => relative(repoRoot, path).replaceAll("\\", "/"));
console.log(`[tests:${group}] ${selected.length} unique files`);
for (const path of displayPaths) console.log(`  ${path}`);

const result = spawnSync(process.execPath, ["--test", ...selected], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
