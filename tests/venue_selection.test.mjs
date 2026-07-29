import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cycleVenueSelection,
  getVenueOption,
  loadVenueSelection,
  saveVenueSelection,
  VENUE_OPTIONS,
  VENUE_STORAGE_KEY,
} from "../js/venue-selection.js";
import {
  normalizeVenueId,
  productionVenueGroupIds,
  venueBudgetSnapshot,
  venueGroupIds,
  VENUE_IDS,
  VENUE_QUALITY_BUDGETS,
  VENUE_VIEW_PRESETS,
} from "../js/venue-scenes.js";

const root = new URL("../", import.meta.url);

test("venue choice cycles, persists, and recovers from storage failures", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.deepEqual(VENUE_OPTIONS.map((venue) => venue.id), ["montgomery", "arena840"]);
  assert.equal(cycleVenueSelection("montgomery", 1), "arena840");
  assert.equal(cycleVenueSelection("montgomery", -1), "arena840");
  assert.equal(saveVenueSelection("arena840", storage), "arena840");
  assert.equal(values.get(VENUE_STORAGE_KEY), "arena840");
  assert.equal(loadVenueSelection(storage), "arena840");
  assert.equal(getVenueOption("unknown").id, "montgomery");
  assert.equal(loadVenueSelection({ getItem() { throw new Error("blocked"); } }), "montgomery");
});

test("every mode follows mode to ball to venue to game with back navigation to Ball Locker", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
  ]);
  for (const id of [
    "ball-select",
    "confirm-ball-selection",
    "venue-select",
    "venue-preview",
    "previous-venue",
    "next-venue",
    "confirm-venue-selection",
  ]) assert.match(html, new RegExp(`id="${id}"`));
  for (const mode of ["street", "threePoint", "team", "duos", "quads", "fives", "practice"]) {
    assert.match(html, new RegExp(`data-mode="${mode}"`));
  }
  assert.match(app, /function confirmBallSelection\(\)[\s\S]*showVenueSelection\(\)/);
  assert.match(app, /function leaveVenueSelection\(\)[\s\S]*showBallSelection\(pendingModeKey, ballSelectionOrigin\)/);
  assert.match(app, /function confirmVenueSelection\(\)[\s\S]*saveVenueSelection[\s\S]*startMode\(pendingModeKey\)/);
});

test("both venues expose six named views, deterministic group IDs, and monotonic budgets", () => {
  for (const venueId of Object.values(VENUE_IDS)) {
    assert.deepEqual(Object.keys(VENUE_VIEW_PRESETS[venueId]), [
      "baseline", "sideline", "bleachers", "rafters", "scoreboard", "court-wide",
    ]);
    assert.equal(venueGroupIds(venueId).length, 7);
    assert.equal(productionVenueGroupIds(venueId).length, 8);
    assert.equal(normalizeVenueId(venueId), venueId);
    for (const metric of ["calls", "triangles", "geometries", "textures"]) {
      const budgets = VENUE_QUALITY_BUDGETS[venueId];
      assert.ok(budgets.low[metric] <= budgets.medium[metric]);
      assert.ok(budgets.medium[metric] <= budgets.high[metric]);
    }
    const high = venueBudgetSnapshot(venueId, "high");
    assert.ok(high.calls <= 140);
    assert.ok(high.triangles <= 58000);
    assert.ok(high.geometries <= 220);
    assert.ok(high.textures <= 12);
    assert.equal(high.downloadedBytes, 0);
    assert.equal(high.glbBytes, 0);
  }
  assert.equal(VENUE_QUALITY_BUDGETS.arena840.high.seats, 840);
});

test("production uses SceneGroupLoader lifecycle and selected venue reaches the engine", async () => {
  const [app, productionLoader, engine] = await Promise.all([
    readFile(new URL("js/app.js", root), "utf8"),
    readFile(new URL("js/production-venue-loader.js", root), "utf8"),
    readFile(new URL("js/engine.js", root), "utf8"),
  ]);
  assert.match(app, /createEngine\(currentModeKey, false, null, pendingVenueId\)/);
  assert.match(app, /createProductionVenueLoader/);
  assert.match(app, /await venueLoadPromise/);
  assert.doesNotMatch(app, /updateSceneLoading\(currentModeKey, "optional", 0\.9/);
  assert.match(productionLoader, /createSceneGroupLoader/);
  assert.match(productionLoader, /production-court/);
  assert.match(productionLoader, /production-hoops/);
  assert.match(productionLoader, /production-players/);
  assert.match(productionLoader, /loader\.cancel\(\)/);
  assert.match(productionLoader, /releaseScene\(sceneId, \{ dispose \}\)/);
  assert.match(engine, /"montgomery", "arena840"/);
});

