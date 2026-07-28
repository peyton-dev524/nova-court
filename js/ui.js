/**
 * NOVA COURT presentation controller.
 *
 * Markup is enhanced through data attributes instead of hard dependencies on a
 * specific page structure. Gameplay can either call the controller directly or
 * listen for the `nova:action` events emitted by menu controls.
 */

const DEFAULT_SETTINGS = Object.freeze({
  musicVolume: 0.55,
  sfxVolume: 0.8,
  muted: false,
  reducedMotion: false,
  highContrast: false,
  colorBlind: "default",
  captions: true,
  cameraShake: 0.65,
  difficulty: "pro",
});

const COLOR_BLIND_MODES = new Set(["default", "deuteranopia", "protanopia", "tritanopia"]);
const DIFFICULTIES = new Set(["rookie", "starter", "pro", "allStar", "legend"]);

export function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Number.isFinite(Number(totalSeconds)) ? Number(totalSeconds) : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const tenths = safe < 10 ? `.${Math.floor((safe % 1) * 10)}` : "";
  return `${minutes}:${String(seconds).padStart(2, "0")}${tenths}`;
}

export function formatScore(value) {
  return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, "0");
}

export function normalizeSettings(input = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...(input || {}) };
  return {
    musicVolume: clamp(merged.musicVolume),
    sfxVolume: clamp(merged.sfxVolume),
    muted: Boolean(merged.muted),
    reducedMotion: Boolean(merged.reducedMotion),
    highContrast: Boolean(merged.highContrast),
    colorBlind: COLOR_BLIND_MODES.has(merged.colorBlind) ? merged.colorBlind : "default",
    captions: Boolean(merged.captions),
    cameraShake: clamp(merged.cameraShake),
    difficulty: DIFFICULTIES.has(merged.difficulty) ? merged.difficulty : "pro",
  };
}

function createElement(doc, tag, className, attributes = {}) {
  const node = doc.createElement(tag);
  node.className = className;
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  }
  return node;
}

function setText(root, selector, value) {
  const node = root.querySelector(selector);
  if (node && value !== undefined && value !== null) node.textContent = String(value);
}

function getStoredSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage?.getItem("nova-court-settings") || "{}"));
  } catch {
    return normalizeSettings();
  }
}

export class NovaUIController {
  constructor({ root, storage, audio } = {}) {
    if (!root && typeof document === "undefined") {
      throw new Error("NovaUIController requires a DOM root.");
    }
    this.root = root || document;
    this.doc = this.root.ownerDocument || this.root;
    this.win = this.doc.defaultView || (typeof window !== "undefined" ? window : null);
    this.storage = storage || this.win?.localStorage;
    this.audio = audio || null;
    this.settings = getStoredSettings(this.storage);
    this.activeScreen = null;
    this.isPaused = false;
    this.currentMode = null;
    this.toastTimer = 0;
    this.countdownTimer = 0;
    this.cleanup = [];

    this.ensureUtilityLayers();
    this.bind();
    this.applySettings(this.settings, { persist: false, emit: false });

    const initial =
      this.root.querySelector("[data-screen].is-active, [data-screen][aria-hidden='false']") ||
      this.root.querySelector("[data-screen]");
    if (initial) this.showScreen(initial.dataset.screen, { focus: false, emit: false });
  }

  ensureUtilityLayers() {
    const parent = this.doc.body || this.root.documentElement || this.root;

    this.liveRegion = this.root.querySelector("[data-live-region]");
    if (!this.liveRegion) {
      this.liveRegion = createElement(this.doc, "div", "sr-only", {
        "data-live-region": "",
        "aria-live": "polite",
        "aria-atomic": "true",
      });
      parent.append(this.liveRegion);
    }

    this.toastRegion = this.root.querySelector("[data-toast-region]");
    if (!this.toastRegion) {
      this.toastRegion = createElement(this.doc, "div", "toast-region", {
        "data-toast-region": "",
        "aria-live": "polite",
      });
      parent.append(this.toastRegion);
    }

    this.captionRegion = this.root.querySelector("[data-caption]");
    if (!this.captionRegion) {
      this.captionRegion = createElement(this.doc, "div", "caption-bubble", {
        "data-caption": "",
        "aria-live": "polite",
        hidden: "",
      });
      parent.append(this.captionRegion);
    }

    this.loadingLayer = this.root.querySelector("[data-loading]");
    if (!this.loadingLayer) {
      this.loadingLayer = createElement(this.doc, "div", "loading-layer", {
        "data-loading": "",
        role: "status",
        "aria-live": "polite",
        hidden: "",
      });
      this.loadingLayer.innerHTML =
        '<div class="loading-card"><div class="nova-spinner" aria-hidden="true"></div>' +
        '<strong>NOVA COURT</strong><span data-loading-message>Warming up the court…</span>' +
        '<div class="loading-track"><i data-loading-progress></i></div></div>';
      parent.append(this.loadingLayer);
    }

    this.errorLayer = this.root.querySelector("[data-error]");
    if (!this.errorLayer) {
      this.errorLayer = createElement(this.doc, "section", "modal-layer error-layer", {
        "data-error": "",
        role: "alertdialog",
        "aria-modal": "true",
        hidden: "",
      });
      this.errorLayer.innerHTML =
        '<div class="modal-card"><span class="eyebrow">COURT OFFLINE</span>' +
        '<h2>Something broke the play.</h2><p data-error-message></p>' +
        '<div class="button-row"><button class="button primary" data-action="retry">Try again</button>' +
        '<button class="button ghost" data-action="menu">Main menu</button></div></div>';
      parent.append(this.errorLayer);
    }
  }

  bind() {
    const onClick = (event) => {
      const control = event.target.closest?.("[data-action]");
      if (!control || !this.root.contains(control)) return;
      const action = control.dataset.action;
      const detail = {
        action,
        mode: control.dataset.mode,
        value: control.dataset.value,
        source: control,
      };

      if (action === "pause") this.openPause();
      if (action === "resume") this.closePause();
      if (action === "settings") this.openPanel("settings");
      if (action === "controls") this.openPanel("controls");
      if (action === "close-panel") this.closePanel();
      if (action === "menu") this.showScreen("menu");
      if (action === "play" && detail.mode) this.currentMode = detail.mode;

      this.emit("nova:action", detail);
      this.audio?.playSfx?.("ui");
    };

    const onInput = (event) => {
      const control = event.target;
      const key = control?.dataset?.setting;
      if (!key) return;
      const value =
        control.type === "checkbox"
          ? control.checked
          : control.type === "range"
            ? Number(control.value)
            : control.value;
      this.applySettings({ ...this.settings, [key]: value });
    };

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (!this.root.querySelector("[data-screen='game'].is-active")) return;
      event.preventDefault();
      this.togglePause();
      this.emit("nova:action", { action: this.isPaused ? "pause" : "resume", source: "keyboard" });
    };

    const onCaption = (event) => this.caption(event.detail?.text || event.detail?.name);

    this.root.addEventListener("click", onClick);
    this.root.addEventListener("input", onInput);
    this.root.addEventListener("change", onInput);
    this.win?.addEventListener("keydown", onKeyDown);
    this.win?.addEventListener("nova:caption", onCaption);
    this.cleanup.push(
      () => this.root.removeEventListener("click", onClick),
      () => this.root.removeEventListener("input", onInput),
      () => this.root.removeEventListener("change", onInput),
      () => this.win?.removeEventListener("keydown", onKeyDown),
      () => this.win?.removeEventListener("nova:caption", onCaption),
    );
  }

  emit(name, detail) {
    if (!this.win || typeof this.win.CustomEvent !== "function") return;
    this.win.dispatchEvent(new this.win.CustomEvent(name, { detail }));
  }

  announce(message, assertive = false) {
    if (!message) return;
    this.liveRegion.setAttribute("aria-live", assertive ? "assertive" : "polite");
    this.liveRegion.textContent = "";
    this.win?.setTimeout(() => {
      this.liveRegion.textContent = message;
    }, 20);
  }

  showScreen(name, { focus = true, emit = true } = {}) {
    const next = this.root.querySelector(`[data-screen="${name}"]`);
    if (!next) return false;
    for (const screen of this.root.querySelectorAll("[data-screen]")) {
      const active = screen === next;
      screen.classList.toggle("is-active", active);
      screen.setAttribute("aria-hidden", String(!active));
      if ("inert" in screen) screen.inert = !active;
    }
    this.activeScreen = name;
    if (focus) {
      const focusTarget = next.querySelector("[data-autofocus], h1, h2, button, [tabindex]");
      focusTarget?.focus?.({ preventScroll: true });
    }
    if (emit) this.emit("nova:screen", { screen: name });
    return true;
  }

  showModeSelect() {
    return this.showScreen("modes");
  }

  startGame(mode) {
    this.currentMode = mode;
    this.isPaused = false;
    this.closePanel();
    this.showScreen("game");
    this.emit("nova:action", { action: "play", mode });
  }

  setLoading(visible, message = "Warming up the court…", progress = null) {
    this.loadingLayer.hidden = !visible;
    this.loadingLayer.classList.toggle("is-visible", Boolean(visible));
    setText(this.loadingLayer, "[data-loading-message]", message);
    const bar = this.loadingLayer.querySelector("[data-loading-progress]");
    if (bar) {
      const known = Number.isFinite(Number(progress));
      bar.style.width = known ? `${clamp(progress) * 100}%` : "42%";
      bar.parentElement?.classList.toggle("is-indeterminate", !known);
    }
    if (visible) this.announce(message);
  }

  showError(message = "The game could not continue. Your settings are safe.") {
    setText(this.errorLayer, "[data-error-message]", message);
    this.errorLayer.hidden = false;
    this.errorLayer.classList.add("is-visible");
    this.errorLayer.querySelector("button")?.focus?.();
    this.announce(message, true);
  }

  clearError() {
    this.errorLayer.hidden = true;
    this.errorLayer.classList.remove("is-visible");
  }

  setHUD(state = {}) {
    setText(this.root, "[data-hud='home-score']", formatScore(state.homeScore));
    setText(this.root, "[data-hud='away-score']", formatScore(state.awayScore));
    setText(this.root, "[data-hud='clock']", formatClock(state.clock));
    setText(this.root, "[data-hud='shot-clock']", state.shotClock == null ? "--" : Math.max(0, Math.ceil(state.shotClock)));
    setText(this.root, "[data-hud='home-name']", state.homeName);
    setText(this.root, "[data-hud='away-name']", state.awayName);
    setText(this.root, "[data-hud='objective']", state.objective);
    setText(this.root, "[data-hud='streak']", state.streak ? `×${state.streak}` : "");
    if (state.possession) {
      for (const item of this.root.querySelectorAll("[data-team]")) {
        item.classList.toggle("has-possession", item.dataset.team === state.possession);
      }
    }
  }

  setShotMeter(value, state = "idle", label = "") {
    const meter = this.root.querySelector("[data-shot-meter]");
    if (!meter) return;
    const amount = clamp(value);
    meter.style.setProperty("--shot-value", amount);
    meter.dataset.state = state;
    meter.setAttribute("aria-valuenow", String(Math.round(amount * 100)));
    meter.setAttribute("aria-valuetext", label || `${Math.round(amount * 100)} percent`);
    setText(meter, "[data-shot-label]", label);
  }

  setPrompt(text, { key = "", tone = "neutral", timeout = 0 } = {}) {
    const prompt = this.root.querySelector("[data-prompt]");
    if (!prompt) return;
    prompt.hidden = !text;
    prompt.dataset.tone = tone;
    setText(prompt, "[data-prompt-key]", key);
    setText(prompt, "[data-prompt-text]", text);
    if (timeout > 0) this.win?.setTimeout(() => (prompt.hidden = true), timeout);
  }

  toast(message, tone = "neutral", duration = 2400) {
    if (!message) return;
    this.win?.clearTimeout(this.toastTimer);
    const toast = createElement(this.doc, "div", "toast", { "data-tone": tone, role: "status" });
    toast.textContent = message;
    this.toastRegion.replaceChildren(toast);
    this.win?.requestAnimationFrame?.(() => toast.classList.add("is-visible"));
    this.toastTimer = this.win?.setTimeout(() => {
      toast.classList.remove("is-visible");
      this.win?.setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  caption(text, duration = 1700) {
    if (!this.settings.captions || !text) return;
    this.captionRegion.textContent = `[${text}]`;
    this.captionRegion.hidden = false;
    this.captionRegion.classList.add("is-visible");
    this.win?.clearTimeout(this.captionTimer);
    this.captionTimer = this.win?.setTimeout(() => {
      this.captionRegion.classList.remove("is-visible");
      this.win?.setTimeout(() => (this.captionRegion.hidden = true), 180);
    }, duration);
  }

  openPause() {
    this.isPaused = true;
    this.root.querySelector("[data-overlay='pause']")?.classList.add("is-open");
    this.root.querySelector("[data-overlay='pause']")?.removeAttribute("hidden");
    this.root.documentElement?.classList.add("is-paused");
    this.announce("Game paused");
  }

  closePause() {
    this.isPaused = false;
    const pause = this.root.querySelector("[data-overlay='pause']");
    pause?.classList.remove("is-open");
    if (pause) pause.hidden = true;
    this.root.documentElement?.classList.remove("is-paused");
    this.announce("Game resumed");
  }

  togglePause() {
    if (this.isPaused) this.closePause();
    else this.openPause();
    return this.isPaused;
  }

  openPanel(name) {
    const panel = this.root.querySelector(`[data-panel="${name}"]`);
    if (!panel) return false;
    panel.hidden = false;
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    panel.querySelector("[data-autofocus], button, input, select")?.focus?.();
    return true;
  }

  closePanel(name) {
    const selector = name ? `[data-panel="${name}"]` : "[data-panel].is-open";
    for (const panel of this.root.querySelectorAll(selector)) {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      panel.hidden = true;
    }
  }

  applySettings(next, { persist = true, emit = true } = {}) {
    this.settings = normalizeSettings(next);
    const html = this.root.documentElement || this.doc.documentElement;
    html.classList.toggle("reduce-motion", this.settings.reducedMotion);
    html.classList.toggle("high-contrast", this.settings.highContrast);
    html.dataset.colorBlind = this.settings.colorBlind;
    html.style.setProperty("--camera-shake", String(this.settings.cameraShake));

    for (const control of this.root.querySelectorAll("[data-setting]")) {
      const value = this.settings[control.dataset.setting];
      if (control.type === "checkbox") control.checked = Boolean(value);
      else if (value !== undefined) control.value = String(value);
      const output = control.closest(".setting-row")?.querySelector("output");
      if (output && typeof value === "number") output.value = `${Math.round(value * 100)}%`;
    }

    this.audio?.setMusicVolume?.(this.settings.musicVolume);
    this.audio?.setSfxVolume?.(this.settings.sfxVolume);
    this.audio?.setMuted?.(this.settings.muted);
    if (persist) {
      try {
        this.storage?.setItem("nova-court-settings", JSON.stringify(this.settings));
      } catch {
        // Privacy modes may deny storage; the in-memory settings still work.
      }
    }
    if (emit) this.emit("nova:settings", { ...this.settings });
    return { ...this.settings };
  }

  showCountdown(seconds = 3, onComplete) {
    this.win?.clearInterval(this.countdownTimer);
    const layer = this.root.querySelector("[data-countdown]");
    if (!layer) {
      onComplete?.();
      return;
    }
    let value = Math.max(1, Math.ceil(seconds));
    layer.hidden = false;
    layer.classList.add("is-visible");
    const tick = () => {
      layer.textContent = value > 0 ? String(value) : "BALL UP";
      this.audio?.playSfx?.(value > 0 ? "countdown" : "buzzer");
      if (value < 0) {
        this.win?.clearInterval(this.countdownTimer);
        layer.hidden = true;
        layer.classList.remove("is-visible");
        onComplete?.();
      }
      value -= 1;
    };
    tick();
    this.countdownTimer = this.win?.setInterval(tick, 850);
  }

  showResults(result = {}) {
    setText(this.root, "[data-result='eyebrow']", result.eyebrow || "FINAL");
    setText(this.root, "[data-result='title']", result.title || (result.won ? "COURT CONQUERED" : "RUN IT BACK"));
    setText(this.root, "[data-result='score']", result.score);
    setText(this.root, "[data-result='summary']", result.summary);
    setText(this.root, "[data-result='grade']", result.grade);
    this.showScreen("results");
    this.announce(result.title || (result.won ? "You win" : "Game over"), true);
  }

  destroy() {
    this.cleanup.splice(0).forEach((fn) => fn());
    this.win?.clearTimeout(this.toastTimer);
    this.win?.clearTimeout(this.captionTimer);
    this.win?.clearInterval(this.countdownTimer);
  }
}

export function createUIController(options) {
  return new NovaUIController(options);
}

if (typeof window !== "undefined") {
  window.NovaUI = Object.assign(window.NovaUI || {}, {
    create: createUIController,
    NovaUIController,
    formatClock,
    formatScore,
    normalizeSettings,
  });
}
