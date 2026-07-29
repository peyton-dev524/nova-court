import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

import {
  BASKETBALL_SHOE_STYLE_IDS,
  COURT_CLASSIC_DIMENSIONS,
  basketballShoeLowerLegFit,
  courtClassicEllipsePoint,
  courtClassicRockerHeight,
  courtClassicToeCapRise,
  createBasketballShoe,
  createNovaCourtClassicShoe,
  createNovaFlightShoe,
  normalizeBasketballShoeStyle,
} from "../js/basketball-shoes.js";

const root = new URL("../", import.meta.url);

async function loadThree() {
  const source = await readFile(new URL("vendor/three.min.js", root), "utf8");
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    console,
    globalThis: {},
    self: {},
  });
  vm.runInContext(source, context, { filename: "three.min.js" });
  return module.exports;
}

function dimensionsOf(T, object) {
  object.updateMatrixWorld(true);
  const size = new T.Box3().setFromObject(object).getSize(new T.Vector3());
  return { width: size.x, height: size.y, length: size.z };
}

test("shoe styles normalize to two canonical IDs with a compatible Flight fallback", () => {
  assert.deepEqual(BASKETBALL_SHOE_STYLE_IDS, ["nova-flight", "court-classic"]);
  assert.equal(normalizeBasketballShoeStyle("court-classic"), "court-classic");
  assert.equal(normalizeBasketballShoeStyle("nova-flight"), "nova-flight");
  assert.equal(normalizeBasketballShoeStyle("unknown"), "nova-flight");
  assert.equal(normalizeBasketballShoeStyle(undefined), "nova-flight");
});

test("Court Classic lower-leg fit inserts a tapered sock without covering the high-top collar", () => {
  const fit = basketballShoeLowerLegFit("court-classic");
  const sockBottom = fit.sock.centerY - fit.sock.height * 0.5;
  const shinBottom = fit.shin.centerY - (fit.shin.length * 0.5 + 0.086);

  assert.ok(sockBottom < fit.collarJoinY, "sock must insert slightly inside the collar");
  assert.ok(fit.collarJoinY - sockBottom <= 0.005, "collar insertion must stay subtle");
  assert.ok(fit.sock.radiusBottom < fit.collarInnerRadius, "sock must fit inside the collar opening");
  assert.ok(shinBottom > fit.collarJoinY, "skin shin must stop above the visible shoe collar");
  assert.ok(fit.sock.radiusTop > fit.sock.radiusBottom * 2, "sock should taper anatomically into the shoe");
});

test("NOVA Flight keeps its established low-top leg and mounting profile", () => {
  const fit = basketballShoeLowerLegFit("nova-flight");
  assert.deepEqual(fit.shin, { length: 0.315, centerY: -0.235 });
  assert.deepEqual(fit.sock, {
    radiusTop: 0.091,
    radiusBottom: 0.083,
    height: 0.18,
    centerY: -0.425,
  });
  assert.deepEqual(fit.shoe.position, [0, -0.603, 0.08]);
  assert.equal(fit.shoe.rotationX, -0.025);
});

test("Court Classic trigonometric profiles preserve ellipse symmetry and curved monotonic rises", () => {
  const a = courtClassicEllipsePoint(0.054, 0.02, Math.PI * 0.31);
  const opposite = courtClassicEllipsePoint(0.054, 0.02, Math.PI * 1.31);
  assert.ok(Math.abs(a.x + opposite.x) < 1e-12);
  assert.ok(Math.abs(a.y + opposite.y) < 1e-12);

  const toeSamples = Array.from({ length: 11 }, (_, index) => courtClassicToeCapRise(index / 10));
  assert.equal(toeSamples[0], 0);
  assert.ok(Math.abs(toeSamples.at(-1) - 1) < 1e-12);
  for (let index = 1; index < toeSamples.length; index += 1) {
    assert.ok(toeSamples[index] >= toeSamples[index - 1]);
  }

  const rockerSamples = [0.52, 0.64, 0.76, 0.88, 1].map(courtClassicRockerHeight);
  for (let index = 1; index < rockerSamples.length; index += 1) {
    assert.ok(rockerSamples[index] > rockerSamples[index - 1]);
  }
  assert.equal(courtClassicRockerHeight(0), 0.002);
  assert.ok(courtClassicRockerHeight(1) > courtClassicRockerHeight(-1));
});

test("Court Classic runtime model meets inferred dimensions, part, texture, and browser cost contracts", async () => {
  const T = await loadThree();
  const shoe = createNovaCourtClassicShoe(T, { detail: "high", side: 1 });
  const dimensions = dimensionsOf(T, shoe.root);
  const target = COURT_CLASSIC_DIMENSIONS;

  assert.ok(Math.abs(dimensions.length - target.lengthMeters) <= target.toleranceMeters.length);
  assert.ok(Math.abs(dimensions.width - target.widthMeters) <= target.toleranceMeters.width);
  assert.ok(Math.abs(dimensions.height - target.heightMeters) <= target.toleranceMeters.height);
  assert.equal(target.sourcedFootLengthMeters, 0.285);
  assert.equal(target.modelUnitsPerMeter, 1);

  assert.ok(shoe.metrics.triangles <= 13_500, `triangle budget exceeded: ${shoe.metrics.triangles}`);
  assert.ok(shoe.metrics.drawCalls <= 22, `draw-call budget exceeded: ${shoe.metrics.drawCalls}`);
  assert.ok(shoe.metrics.materials <= 9);
  assert.equal(shoe.metrics.textures, 0);

  const names = new Set();
  shoe.root.traverse((object) => {
    if (object.name) names.add(object.name);
  });
  for (const name of [
    "court-classic-outsole",
    "court-classic-midsole-band",
    "court-classic-canvas-upper",
    "court-classic-ankle-quarter",
    "court-classic-toe-cap",
    "court-classic-tongue",
    "court-classic-quarter-panels",
    "court-classic-heel-reinforcement",
    "court-classic-collar-binding",
    "court-classic-eyelets-seven-pairs",
    "court-classic-crossed-laces",
    "court-classic-sidewall-stripe",
    "court-classic-double-stitching",
    "court-classic-chevron-tread",
  ]) {
    assert.equal(names.has(name), true, `${name} must be independently named/pickable`);
  }
  assert.equal(shoe.outsole.name, "court-classic-outsole");
  assert.equal(shoe.root.userData.sculptRuntime.styleId, "court-classic");
  assert.equal(shoe.root.userData.sculptRuntime.inferredSurfaces.includes("outer-width"), true);
});

test("Court Classic is lighter than NOVA Flight and preserves mirrored left/right mounting bounds", async () => {
  const T = await loadThree();
  const right = createNovaCourtClassicShoe(T, { detail: "high", side: 1 });
  const left = createNovaCourtClassicShoe(T, { detail: "high", side: -1 });
  const flight = createNovaFlightShoe(T, { detail: "high", side: 1 });

  assert.ok(right.metrics.triangles < flight.metrics.triangles);
  assert.deepEqual(dimensionsOf(T, left.root), dimensionsOf(T, right.root));
  assert.equal(left.outsole.name, right.outsole.name);
  assert.equal(left.root.userData.sculptRuntime.socket, "foot");
  assert.equal(right.root.userData.sculptRuntime.socket, "foot");

  assert.equal(createBasketballShoe(T, { styleId: "court-classic" }).root.name, "nova-court-classic-shoe");
  assert.equal(createBasketballShoe(T, { styleId: "not-a-style" }).root.name, "nova-flight-shoe");
});

test("engine, player lab, and profile UI wire the canonical shoe style through review and gameplay", async () => {
  const [engine, lab, labHtml, profile, app, index] = await Promise.all([
    readFile(new URL("js/engine.js", root), "utf8"),
    readFile(new URL("js/player-model-lab.js", root), "utf8"),
    readFile(new URL("player-lab.html", root), "utf8"),
    readFile(new URL("js/player-progression.js", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
    readFile(new URL("index.html", root), "utf8"),
  ]);

  assert.match(engine, /normalizeBasketballShoeStyle/);
  assert.match(engine, /basketballShoeLowerLegFit/);
  assert.match(engine, /createBasketballShoe/);
  assert.match(engine, /styleId: this\.metadata\.shoeStyleId/);
  assert.match(lab, /selectedShoeStyle = normalizeBasketballShoeStyle\(query\.get\("shoe"\)\)/);
  assert.match(lab, /createBasketballShoe/);
  assert.match(lab, /availableShoeStyles: BASKETBALL_SHOE_STYLE_IDS/);
  assert.match(labHtml, /id="lab-shoe-style"/);
  assert.match(profile, /shoeStyleId: normalizeBasketballShoeStyle/);
  assert.match(profile, /shoeStyleId: normalized\.identity\.shoeStyleId/);
  assert.match(app, /data-shoe-style/);
  assert.match(index, /id="shoe-style-grid"/);
  assert.match(index, /id="create-player-shoe-style"/);
});
