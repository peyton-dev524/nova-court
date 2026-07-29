import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getEnginePlayerConfig,
  normalizeProfile,
  updatePlayerIdentity,
} from "../js/player-progression.js";

const root = new URL("../", import.meta.url);

test("Precision 7 style persists through profile normalization and engine config", () => {
  const initial = normalizeProfile({
    version: 4,
    identity: {
      created: true,
      displayName: "Shoe Tester",
      shoeStyleId: "precision-7",
    },
  });
  assert.equal(initial.identity.shoeStyleId, "precision-7");
  assert.equal(getEnginePlayerConfig(initial).shoeStyleId, "precision-7");

  const changed = updatePlayerIdentity(initial, {
    displayName: "Shoe Tester",
    shoeStyleId: "precision-7",
  });
  assert.equal(changed.ok, true);
  assert.equal(changed.profile.identity.shoeStyleId, "precision-7");
});

test("dedicated Shoe Lab exposes deterministic cameras, colorways, metrics, and named capture", async () => {
  const [html, js, css, build, playerLab, index] = await Promise.all([
    readFile(new URL("shoe-lab.html", root), "utf8"),
    readFile(new URL("js/shoe-lab.js", root), "utf8"),
    readFile(new URL("js/shoe-lab.css", root), "utf8"),
    readFile(new URL("scripts/build.mjs", root), "utf8"),
    readFile(new URL("player-lab.html", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);

  for (const id of [
    "shoe-lab-style",
    "shoe-lab-colorway",
    "shoe-lab-view",
    "shoe-lab-turntable",
    "shoe-lab-wireframe",
    "shoe-lab-guides",
    "shoe-lab-capture",
    "shoe-lab-triangles",
    "shoe-lab-draws",
    "shoe-lab-fps",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const view of ["front", "three-quarter", "profile", "top", "outsole"]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
  assert.match(js, /globalThis\.__NOVA_SHOE_LAB__/);
  assert.match(js, /setView/);
  assert.match(js, /setColorway/);
  assert.match(js, /preserveDrawingBuffer: true/);
  assert.match(js, /renderer\.info\.render\.triangles/);
  assert.match(js, /assetLoadStatus: "procedural-no-external-models"/);
  assert.match(css, /\.shoe-lab-view-buttons/);
  assert.match(build, /"shoe-lab\.html"/);
  assert.match(playerLab, /value="precision-7"/);
  assert.match(index, /value="precision-7"/);
});
