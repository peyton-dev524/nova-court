import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dist = join(root, "dist");
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const item of ["index.html", "player-lab.html", "dribble-lab.html", "shoe-lab.html", "gym-lab.html", "styles.css", "og.png", "js", "vendor", "assets", "ASSET_LICENSES.md", "README.md"]) {
  cpSync(join(root, item), join(dist, item), { recursive: true });
}
console.log("Built NOVA COURT to dist/");
