import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");

test("secondary screens isolate the title showcase from their own presentation stages", () => {
  const css = read("js/ui-menu-polish.css");
  for (const state of ["player-creation", "profile", "modes", "ball-select", "venue-select"]) {
    assert.match(css, new RegExp('data-state="' + state + '"'));
  }
  assert.match(css, /visibility:\s*hidden/);
  assert.match(css, /#game-root/);
});

test("My Player separates performance and identity without removing the persistent build summary", () => {
  const html = read("index.html");
  const app = read("js/app.js");
  const css = read("js/ui-profile-polish.css");
  assert.match(html, /id="profile-view-tabs"/);
  assert.match(html, /data-profile-view="attributes"/);
  assert.match(html, /data-profile-view="style"/);
  assert.match(app, /function setProfileView/);
  assert.match(app, /setProfileView\("attributes"\)/);
  assert.match(css, /data-profile-view="attributes"/);
  assert.match(css, /data-profile-view="style"/);
  assert.match(html, /class="build-card"/);
});

test("mode selection promotes the active run and keeps its counter synchronized", () => {
  const html = read("index.html");
  const app = read("js/app.js");
  const css = read("js/ui-menu-polish.css");
  assert.match(html, /id="mode-position"/);
  assert.match(app, /const selectModeCard/);
  assert.match(app, /aria-pressed/);
  assert.match(css, /\.mode-card\.is-selected\s*\{[\s\S]*grid-column:\s*span 2/);
});

test("gameplay HUD separates shot clock, objective, and possession status", () => {
  const html = read("index.html");
  const app = read("js/app.js");
  const css = read("js/ui-hud-polish.css");
  assert.match(html, /id="shot-clock-value"/);
  assert.match(html, /id="match-objective"/);
  assert.match(html, /id="possession-label"/);
  assert.match(app, /#shot-clock-value/);
  assert.match(app, /#match-objective/);
  assert.match(css, /\.shot-clock-box/);
  assert.doesNotMatch(app, /shotClock \|\| 0\)\} · FIRST TO/);
});

test("desktop venue selection uses a landscape architectural preview", () => {
  const css = read("js/ui-venue-selection.css");
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*10/);
  assert.match(css, /minmax\(520px,\s*1\.9fr\)/);
});