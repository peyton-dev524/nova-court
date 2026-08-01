import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Park Duel production path owns every required screen without shared preview leakage", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
    readFile(new URL("js/ui-production-slice.css", root), "utf8"),
  ]);
  for (const id of ["main-menu", "mode-select", "ball-select", "venue-select", "match-intro", "hud", "replay-screen", "game-over"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(app, /ballSelectionPreview\?\.setVisible\(false\)/);
  assert.match(app, /venueSelectionPreview\?\.setVisible\(false\)/);
  assert.match(app, /await playMatchIntroduction\(token\)/);
  assert.match(app, /engine\.setPaused\(true\);[\s\S]*engine\.controls\.setEnabled\(false\);/);
  assert.match(css, /screen--match-intro[\s\S]*background:/);
  assert.match(css, /screen--match-intro\.is-hidden\s*\{\s*display:\s*none/);
});

test("NCN intro contains scouting, setup, rule, record, possession, and skip contracts", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const id of ["intro-scouting", "intro-setup", "intro-rules", "intro-home-record", "intro-away-record", "intro-possession", "skip-match-intro", "begin-park-duel"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /NCN LIVE/);
});

test("pause, replay, photo, highlights, persistence, rematch, and recovery are wired", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
  ]);
  for (const tab of ["replay", "statistics", "controls", "camera", "audio", "accessibility", "challenges", "rules"]) assert.match(html, new RegExp(`data-pause-tab=["']${tab}["']`));
  for (const id of ["replay-play", "replay-frame-back", "replay-frame-forward", "replay-speed", "replay-camera", "replay-zoom", "replay-hud-toggle", "open-photo-mode", "save-highlight"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(app, /persistPlatformProgress\(nextPlatformState\)/);
  assert.match(app, /BACKUP VERIFIED/);
  assert.match(app, /#rematch["']\)\?\.addEventListener\(["']click["'], \(\) => startMode\(currentModeKey\)\)/);
  assert.match(app, /window\.addEventListener\(["']blur["'][\s\S]*pauseGame/);
  assert.match(app, /gamepaddisconnected/);
});

test("all new domain modules are imported by the runtime or covered as explicit foundations", async () => {
  const app = await readFile(new URL("js/app.js", root), "utf8");
  assert.match(app, /park-duel-experience\.js/);
  assert.match(app, /interaction-systems\.js/);
  assert.match(app, /platform-foundations\.js/);
  assert.match(app, /ui-production-slice\.css/);
  assert.match(app, /aiAdaptation/);
});
