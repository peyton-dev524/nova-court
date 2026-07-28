import { createAnnouncerDirector } from "./announcer-director.js";

/**
 * Browser bridge for the pure announcer director. Speech synthesis is optional:
 * captions and code-native crowd audio remain available when voices are absent
 * or accessibility/browser policy disables spoken calls.
 */
export function createAnnouncerRuntime({
  audio,
  ui,
  windowRef = globalThis.window,
  director = createAnnouncerDirector(),
  getVolume = () => 0.75,
} = {}) {
  let activeUtterance = null;

  function speak(cue) {
    const synth = windowRef?.speechSynthesis;
    const Utterance = windowRef?.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance !== "function") return false;
    if (cue.interrupt) synth.cancel();
    const utterance = new Utterance(cue.text);
    utterance.volume = Math.max(0, Math.min(1, Number(getVolume()) || 0));
    utterance.rate = cue.priority === "high" ? 1.04 : 0.96;
    utterance.pitch = 0.82;
    const voices = synth.getVoices?.() || [];
    const voice = voices.find((candidate) => /^en(-|_)/i.test(candidate.lang || ""))
      || voices.find((candidate) => /english/i.test(candidate.name || ""));
    if (voice) utterance.voice = voice;
    activeUtterance = utterance;
    utterance.onend = () => {
      if (activeUtterance === utterance) activeUtterance = null;
    };
    synth.speak(utterance);
    return true;
  }

  function announce(type, payload = {}) {
    const cue = director.announce(type, payload);
    if (!cue) return null;
    ui?.caption?.(`ANNOUNCER: ${cue.text}`, cue.priority === "high" ? 2600 : 2100);
    if (cue.crowd.intensity >= 0.48) audio?.playSfx?.("crowd", cue.crowd.intensity);
    speak(cue);
    return cue;
  }

  function stop() {
    if (activeUtterance) windowRef?.speechSynthesis?.cancel?.();
    activeUtterance = null;
  }

  return {
    announce,
    stop,
    reset: () => director.reset(),
    setEnabled: (enabled) => director.setEnabled(enabled),
    get active() {
      return Boolean(activeUtterance);
    },
  };
}

