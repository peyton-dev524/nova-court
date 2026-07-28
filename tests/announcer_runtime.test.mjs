import test from "node:test";
import assert from "node:assert/strict";

import { createAnnouncerRuntime } from "../js/announcer-runtime.js";

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

test("runtime mirrors calls to captions, crowd audio, and speech", () => {
  const captions = [];
  const sfx = [];
  const spoken = [];
  const windowRef = {
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis: {
      speak: (utterance) => spoken.push(utterance),
      cancel() {},
      getVoices: () => [{ name: "NOVA test voice", lang: "en-US" }],
    },
  };
  const runtime = createAnnouncerRuntime({
    windowRef,
    ui: { caption: (...args) => captions.push(args) },
    audio: { playSfx: (...args) => sfx.push(args) },
    getVolume: () => 0.4,
  });
  const cue = runtime.announce("dunk", { playerName: "Ace Nova", seed: 4, now: 10 });
  assert.ok(cue);
  assert.match(captions[0][0], /^ANNOUNCER:/);
  assert.deepEqual(sfx[0], ["crowd", 1]);
  assert.equal(spoken[0].volume, 0.4);
  assert.equal(spoken[0].voice.name, "NOVA test voice");
});

test("runtime still captions when speech synthesis is unavailable", () => {
  let caption = "";
  const runtime = createAnnouncerRuntime({
    windowRef: {},
    ui: { caption: (text) => { caption = text; } },
  });
  assert.ok(runtime.announce("tip", { now: 1 }));
  assert.match(caption, /ANNOUNCER/);
  assert.equal(runtime.active, false);
});

