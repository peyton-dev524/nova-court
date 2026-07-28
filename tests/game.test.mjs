import test from "node:test";
import assert from "node:assert/strict";

const ui = await import("../js/ui.js");
const audio = await import("../js/audio.js");

test("presentation modules load without a browser global", () => {
  assert.equal(typeof ui.createUIController, "function");
  assert.equal(typeof audio.createAudioController, "function");
  assert.equal(typeof audio.NovaAudioController, "function");
});

test("clamp keeps HUD values finite and inside bounds", () => {
  assert.equal(ui.clamp(-4), 0);
  assert.equal(ui.clamp(4), 1);
  assert.equal(ui.clamp(0.42), 0.42);
  assert.equal(ui.clamp(Number.NaN), 0);
  assert.equal(ui.clamp(7, 5, 10), 7);
});

test("game clocks are readable at ordinary and clutch time", () => {
  assert.equal(ui.formatClock(125), "2:05");
  assert.equal(ui.formatClock(9.82), "0:09.8");
  assert.equal(ui.formatClock(-1), "0:00.0");
  assert.equal(ui.formatClock(undefined), "0:00.0");
});

test("score formatting guards bad simulation values", () => {
  assert.equal(ui.formatScore(7), "07");
  assert.equal(ui.formatScore(112.9), "112");
  assert.equal(ui.formatScore(-3), "00");
  assert.equal(ui.formatScore("oops"), "00");
});

test("settings normalization validates accessibility and difficulty options", () => {
  assert.deepEqual(ui.normalizeSettings({
    musicVolume: 1.8,
    sfxVolume: -0.2,
    reducedMotion: 1,
    colorBlind: "unknown",
    difficulty: "impossible",
    captions: false,
    shootingAssist: 3,
  }), {
    musicVolume: 1,
    sfxVolume: 0,
    muted: false,
    reducedMotion: true,
    highContrast: false,
    colorBlind: "default",
    captions: false,
    cameraShake: 0.65,
    difficulty: "pro",
    shootingAssist: 1,
    ballStyle: "classic",
  });
  assert.equal(ui.normalizeSettings({ ballStyle: "redWhiteBlue" }).ballStyle, "redWhiteBlue");
});

test("audio math helpers produce stable values", () => {
  assert.equal(audio.clamp01(-1), 0);
  assert.equal(audio.clamp01(2), 1);
  assert.ok(Math.abs(audio.midiToFrequency(69) - 440) < 0.000001);
  assert.ok(Math.abs(audio.midiToFrequency(60) - 261.625565) < 0.001);
  assert.ok(Math.abs(audio.dbToGain(-6) - 0.501187) < 0.00001);
});

test("audio controller stores values without requiring Web Audio", () => {
  const writes = [];
  const storage = {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, JSON.parse(value)]),
  };
  const controller = audio.createAudioController({ storage });
  assert.equal(controller.setMusicVolume(0.25), 0.25);
  assert.equal(controller.setSfxVolume(0.9), 0.9);
  assert.equal(controller.setMuted(true), true);
  assert.equal(controller.toggleMute(), false);
  assert.equal(controller.setMusicMode("threePoint"), "threePoint");
  assert.equal(controller.setMusicMode("not-a-mode"), "street");
  assert.equal(writes.at(-1)[0], "nova-court-audio");
  controller.destroy();
});
