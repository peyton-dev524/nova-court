import test from "node:test";
import assert from "node:assert/strict";

import {
  AnnouncerDirector,
  crowdCueFor,
} from "../js/announcer-director.js";

test("announcer creates original caption and crowd cue", () => {
  const director = new AnnouncerDirector({ clock: () => 10 });
  const cue = director.announce("dunk", { playerName: "Ace Nova", seed: 7 });
  assert.match(cue.text, /^Ace Nova\./);
  assert.match(cue.clip, /^dunk-\d+$/);
  assert.equal(cue.priority, "high");
  assert.equal(cue.crowd.intensity, 1);
});

test("per-event cooldown prevents repetitive calls", () => {
  let now = 1;
  const director = new AnnouncerDirector({ clock: () => now });
  assert.ok(director.announce("score"));
  now = 1.5;
  assert.equal(director.announce("score"), null);
  now = 3;
  assert.ok(director.announce("score"));
});

test("forced calls bypass cooldown and disabled director stays silent", () => {
  const director = new AnnouncerDirector({ clock: () => 1 });
  assert.ok(director.announce("overtime"));
  assert.ok(director.announce("overtime", { force: true }));
  director.setEnabled(false);
  assert.equal(director.announce("game_over", { force: true }), null);
});

test("crowd intensity reacts to game context", () => {
  const close = crowdCueFor("three", { homeScore: 19, awayScore: 19 });
  const routine = crowdCueFor("three", { homeScore: 4, awayScore: 12 });
  assert.ok(close.intensity > routine.intensity);
  assert.equal(crowdCueFor("game_over", { userWon: false }).intensity, 0.3);
});

