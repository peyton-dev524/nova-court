/**
 * Original procedural audio for NOVA COURT.
 *
 * Every sound is synthesized at runtime with Web Audio. No samples, music
 * recordings, likenesses, or external copyrighted assets are included.
 */

export function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

export function midiToFrequency(note) {
  return 440 * 2 ** ((Number(note) - 69) / 12);
}

export function dbToGain(db) {
  return 10 ** (Number(db) / 20);
}

const CAPTIONS = Object.freeze({
  ui: "menu tick",
  confirm: "selection confirmed",
  back: "menu back",
  dribble: "ball dribble",
  bounce: "ball bounce",
  pass: "quick pass",
  shoot: "shot released",
  swish: "clean swish",
  rim: "shot hits rim",
  backboard: "ball hits backboard",
  dunk: "rim-rattling dunk",
  block: "shot blocked",
  steal: "ball stolen",
  whistle: "referee whistle",
  score: "basket scored",
  buzzer: "game buzzer",
  countdown: "countdown tone",
  crowd: "crowd reaction",
});

function safeStorageRead(storage) {
  try {
    return JSON.parse(storage?.getItem("nova-court-audio") || "{}");
  } catch {
    return {};
  }
}

export class NovaAudioController {
  constructor(options = {}) {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.compressor = null;
    this.storage = options.storage || (typeof window !== "undefined" ? window.localStorage : null);
    const stored = safeStorageRead(this.storage);
    this.musicVolume = clamp01(options.musicVolume ?? stored.musicVolume ?? 0.55);
    this.sfxVolume = clamp01(options.sfxVolume ?? stored.sfxVolume ?? 0.8);
    this.muted = Boolean(options.muted ?? stored.muted ?? false);
    this.captions = options.captions !== false;
    this.musicPlaying = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicScheduledUntil = 0;
    this.activeSources = new Set();
    this.destroyed = false;
  }

  async init() {
    if (this.destroyed) return false;
    if (!this.context) {
      const AudioContextClass =
        typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.sfxBus = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 14;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.006;
      this.compressor.release.value = 0.22;
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      this.updateGains(true);
    }
    if (this.context.state === "suspended") await this.context.resume();
    return true;
  }

  async resume() {
    return this.init();
  }

  updateGains(immediate = false) {
    if (!this.context || !this.master) return;
    const time = this.context.currentTime;
    const change = (param, value) => {
      if (immediate) param.value = value;
      else param.setTargetAtTime(value, time, 0.025);
    };
    change(this.master.gain, this.muted ? 0 : 0.82);
    change(this.musicBus.gain, this.musicVolume);
    change(this.sfxBus.gain, this.sfxVolume);
  }

  persist() {
    try {
      this.storage?.setItem(
        "nova-court-audio",
        JSON.stringify({
          musicVolume: this.musicVolume,
          sfxVolume: this.sfxVolume,
          muted: this.muted,
        }),
      );
    } catch {
      // Audio still works when private browsing blocks storage.
    }
  }

  setMusicVolume(value) {
    this.musicVolume = clamp01(value);
    this.updateGains();
    this.persist();
    return this.musicVolume;
  }

  setSfxVolume(value) {
    this.sfxVolume = clamp01(value);
    this.updateGains();
    this.persist();
    return this.sfxVolume;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.updateGains();
    this.persist();
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  setCaptions(value) {
    this.captions = Boolean(value);
  }

  track(source) {
    this.activeSources.add(source);
    source.addEventListener("ended", () => this.activeSources.delete(source), { once: true });
    return source;
  }

  tone({
    frequency = 440,
    frequencyEnd,
    type = "sine",
    time = this.context?.currentTime || 0,
    duration = 0.1,
    gain = 0.12,
    bus = this.sfxBus,
    attack = 0.004,
    release = 0.06,
    detune = 0,
  } = {}) {
    if (!this.context || !bus) return null;
    const oscillator = this.track(this.context.createOscillator());
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), time);
    oscillator.detune.value = detune;
    if (frequencyEnd) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, frequencyEnd), time + duration);
    }
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);
    oscillator.connect(envelope).connect(bus);
    oscillator.start(time);
    oscillator.stop(time + duration + release + 0.02);
    return oscillator;
  }

  noise({ time = this.context?.currentTime || 0, duration = 0.08, gain = 0.08, highpass = 100 } = {}) {
    if (!this.context || !this.sfxBus) return null;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      const fade = 1 - i / frames;
      channel[i] = (Math.random() * 2 - 1) * fade;
    }
    const source = this.track(this.context.createBufferSource());
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = highpass;
    envelope.gain.setValueAtTime(gain, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(envelope).connect(this.sfxBus);
    source.start(time);
    return source;
  }

  caption(name) {
    if (!this.captions || typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("nova:caption", { detail: { name, text: CAPTIONS[name] || name } }),
    );
  }

  async playSfx(name, intensity = 1) {
    if (!(await this.init())) return false;
    const t = this.context.currentTime + 0.005;
    const scale = 0.45 + clamp01(intensity) * 0.55;
    const tone = (options) => this.tone({ ...options, gain: (options.gain || 0.1) * scale, time: options.time ?? t });

    switch (name) {
      case "ui":
        tone({ frequency: 680, frequencyEnd: 520, type: "sine", duration: 0.025, gain: 0.045 });
        break;
      case "confirm":
        tone({ frequency: 520, type: "triangle", duration: 0.05, gain: 0.07 });
        tone({ frequency: 780, type: "sine", time: t + 0.05, duration: 0.08, gain: 0.06 });
        break;
      case "back":
        tone({ frequency: 440, frequencyEnd: 250, type: "triangle", duration: 0.08, gain: 0.055 });
        break;
      case "dribble":
      case "bounce":
        tone({ frequency: 115, frequencyEnd: 48, type: "sine", duration: 0.055, gain: 0.25 });
        this.noise({ time: t, duration: 0.035, gain: 0.05 * scale, highpass: 700 });
        break;
      case "pass":
      case "shoot":
        this.noise({ time: t, duration: 0.105, gain: 0.09 * scale, highpass: 850 });
        tone({ frequency: 220, frequencyEnd: 410, type: "sine", duration: 0.08, gain: 0.035 });
        break;
      case "swish":
        this.noise({ time: t, duration: 0.36, gain: 0.13 * scale, highpass: 2100 });
        tone({ frequency: 1250, frequencyEnd: 620, type: "sine", duration: 0.22, gain: 0.035 });
        break;
      case "rim":
        [980, 1220, 1470].forEach((frequency, i) =>
          tone({ frequency, type: "square", time: t + i * 0.008, duration: 0.13, gain: 0.035 }),
        );
        break;
      case "backboard":
        tone({ frequency: 185, type: "square", duration: 0.06, gain: 0.12 });
        this.noise({ time: t, duration: 0.05, gain: 0.12 * scale, highpass: 350 });
        break;
      case "dunk":
        tone({ frequency: 92, frequencyEnd: 42, type: "sine", duration: 0.34, gain: 0.32 });
        [1100, 820, 1040].forEach((frequency, i) =>
          tone({ frequency, type: "square", time: t + i * 0.025, duration: 0.12, gain: 0.025 }),
        );
        this.noise({ time: t, duration: 0.28, gain: 0.1 * scale, highpass: 600 });
        break;
      case "block":
      case "steal":
        tone({ frequency: 180, frequencyEnd: 72, type: "sawtooth", duration: 0.14, gain: 0.12 });
        tone({ frequency: 720, frequencyEnd: 280, type: "square", duration: 0.11, gain: 0.045 });
        break;
      case "whistle":
        tone({ frequency: 2400, type: "sine", duration: 0.11, gain: 0.11 });
        tone({ frequency: 2800, type: "sine", time: t + 0.13, duration: 0.17, gain: 0.1 });
        break;
      case "countdown":
        tone({ frequency: 640, type: "sine", duration: 0.12, gain: 0.08 });
        break;
      case "buzzer":
        tone({ frequency: 118, type: "sawtooth", duration: 0.72, gain: 0.16 });
        tone({ frequency: 121, type: "square", duration: 0.72, gain: 0.07 });
        break;
      case "score":
        [60, 64, 67, 72].forEach((note, i) =>
          tone({ frequency: midiToFrequency(note), type: "triangle", time: t + i * 0.055, duration: 0.16, gain: 0.065 }),
        );
        break;
      case "crowd":
        this.noise({ time: t, duration: 0.7, gain: 0.09 * scale, highpass: 240 });
        break;
      default:
        return false;
    }
    this.caption(name);
    return true;
  }

  scheduleMusic() {
    if (!this.musicPlaying || !this.context || this.context.state !== "running") return;
    const beat = 60 / 94 / 2;
    const lookahead = this.context.currentTime + 1.8;
    if (this.musicScheduledUntil < this.context.currentTime) {
      this.musicScheduledUntil = this.context.currentTime + 0.05;
    }
    const bass = [38, 38, 45, 38, 41, 41, 48, 36];
    const lead = [62, null, 65, 69, null, 67, 65, 60, 62, null, 69, 72, 67, null, 65, null];
    while (this.musicScheduledUntil < lookahead) {
      const step = this.musicStep;
      const time = this.musicScheduledUntil;
      if (step % 2 === 0) {
        this.tone({
          frequency: midiToFrequency(bass[(step / 2) % bass.length]),
          type: "triangle",
          time,
          duration: beat * 1.3,
          release: 0.12,
          gain: 0.075,
          bus: this.musicBus,
        });
      }
      const leadNote = lead[step % lead.length];
      if (leadNote) {
        this.tone({
          frequency: midiToFrequency(leadNote),
          type: "sine",
          time,
          duration: beat * 0.56,
          release: 0.14,
          gain: 0.027,
          bus: this.musicBus,
          detune: step % 4 === 0 ? -5 : 4,
        });
      }
      // Soft synthetic kick and hat keep the menu groove grounded.
      if (step % 4 === 0 || step % 8 === 6) {
        this.tone({
          frequency: 118,
          frequencyEnd: 44,
          type: "sine",
          time,
          duration: 0.09,
          release: 0.04,
          gain: 0.09,
          bus: this.musicBus,
        });
      }
      if (step % 2 === 1) {
        const frames = Math.floor(this.context.sampleRate * 0.025);
        const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
        const source = this.track(this.context.createBufferSource());
        const highpass = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        source.buffer = buffer;
        highpass.type = "highpass";
        highpass.frequency.value = 5800;
        gain.gain.value = 0.018;
        source.connect(highpass).connect(gain).connect(this.musicBus);
        source.start(time);
      }
      this.musicStep += 1;
      this.musicScheduledUntil += beat;
    }
  }

  async startMusic() {
    if (!(await this.init())) return false;
    if (this.musicPlaying) return true;
    this.musicPlaying = true;
    this.musicScheduledUntil = this.context.currentTime;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 500);
    return true;
  }

  stopMusic() {
    this.musicPlaying = false;
    if (typeof window !== "undefined") window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  destroy() {
    this.stopMusic();
    this.destroyed = true;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Source may already have ended.
      }
    }
    this.activeSources.clear();
    this.context?.close?.();
    this.context = null;
  }
}

export function createAudioController(options) {
  return new NovaAudioController(options);
}

if (typeof window !== "undefined") {
  window.NovaAudio = Object.assign(window.NovaAudio || {}, {
    create: createAudioController,
    NovaAudioController,
  });
}
