import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BALL_SELECTION_OPTIONS,
  ballSelectionIndex,
  cycleBallSelection,
  getBallSelectionOption,
} from "../js/ball-selection.js";

const root = new URL("../", import.meta.url);

test("ball locker exposes both production finishes and wraps with either arrow", () => {
  assert.deepEqual(BALL_SELECTION_OPTIONS.map((option) => option.id), [
    "classic",
    "redWhiteBlue",
  ]);
  assert.equal(ballSelectionIndex("classic"), 0);
  assert.equal(ballSelectionIndex("redWhiteBlue"), 1);
  assert.equal(cycleBallSelection("classic", 1), "redWhiteBlue");
  assert.equal(cycleBallSelection("classic", -1), "redWhiteBlue");
  assert.equal(cycleBallSelection("redWhiteBlue", 1), "classic");
  assert.equal(getBallSelectionOption("unknown").id, "classic");
});

test("every new mode launch routes through the Ball Locker before gameplay", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
  ]);

  for (const id of [
    "ball-select",
    "ball-preview",
    "previous-ball",
    "next-ball",
    "confirm-ball-selection",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const mode of ["street", "threePoint", "team", "duos", "quads", "fives", "practice"]) {
    assert.match(html, new RegExp(`data-mode="${mode}"`));
  }
  assert.doesNotMatch(html, /id="ball-style"/);
  assert.match(app, /showBallSelection\("street", "menu"\)/);
  assert.match(app, /showBallSelection\(selectedModeKey, "modes"\)/);
  assert.match(app, /ui\.applySettings\(\{ \.\.\.ui\.settings, ballStyle: selected\.id \}\)/);
  assert.match(app, /startMode\(pendingModeKey\)/);
});
