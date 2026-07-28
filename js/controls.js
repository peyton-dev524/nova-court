/**
 * Nova Court input abstraction.
 *
 * Keyboard and gamepad are merged into one predictable action surface. UI code can
 * remap keyboard bindings without knowing about the engine and gameplay can query
 * edge-triggered actions without attaching its own listeners.
 */

export const DEFAULT_BINDINGS = Object.freeze({
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  shoot: ["Space", "KeyK"],
  pass: ["KeyE", "KeyJ"],
  defend: ["Space", "KeyL"],
  steal: ["KeyE", "KeyI"],
  dunk: ["KeyI"],
  sprint: ["ShiftLeft", "ShiftRight"],
  modifier: ["KeyQ", "ControlLeft", "ControlRight"],
  camera: ["KeyC"],
  pause: ["Escape", "KeyP"],
  restart: ["KeyR"],
});

const GAMEPAD_BUTTONS = Object.freeze({
  shoot: 2,    // X / Square
  pass: 0,     // A / Cross
  steal: 0,    // A / Cross (defensive context)
  dunk: 2,     // X / Square (offensive rim context)
  defend: 2,   // X / Square (defensive context)
  sprint: 7,   // RT / R2
  modifier: 6, // LT / L2
  camera: 8,   // View / Share
  pause: 9,    // Menu / Options
  restart: 12, // D-pad up
});

const ACTIONS = Object.freeze([
  "shoot", "pass", "defend", "steal", "dunk", "sprint", "modifier",
  "camera", "pause", "restart",
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function deadzone(value, threshold) {
  const magnitude = Math.abs(value);
  if (magnitude <= threshold) return 0;
  return Math.sign(value) * ((magnitude - threshold) / (1 - threshold));
}

export class CourtControls {
  constructor(options = {}) {
    this.target = options.target || window;
    this.deadzone = options.deadzone ?? 0.16;
    this.bindings = {};
    this.enabled = true;
    this.keys = new Set();
    this.keyPressed = new Set();
    this.keyReleased = new Set();
    this.actions = new Map();
    this.previousActions = new Map();
    this.pressedActions = new Set();
    this.releasedActions = new Set();
    this.move = { x: 0, y: 0, magnitude: 0 };
    this.aim = { x: 0, y: 0, magnitude: 0 };
    this.activeGamepad = null;
    this.inputMethod = "keyboard";
    this.lastInputAt = performance.now();
    this._listeners = new Set();

    this.setBindings({ ...DEFAULT_BINDINGS, ...(options.bindings || {}) });
    for (const action of ACTIONS) {
      this.actions.set(action, false);
      this.previousActions.set(action, false);
    }

    this._onKeyDown = (event) => {
      if (!this.enabled) return;
      if (this._isBoundCode(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) this.keyPressed.add(event.code);
      this.keys.add(event.code);
      this.inputMethod = "keyboard";
      this.lastInputAt = performance.now();
    };
    this._onKeyUp = (event) => {
      if (this._isBoundCode(event.code)) event.preventDefault();
      this.keys.delete(event.code);
      this.keyReleased.add(event.code);
    };
    this._onBlur = () => this.clear();
    this._onGamepadConnected = (event) => {
      this.activeGamepad = event.gamepad.index;
      this._emit("gamepadchange", { connected: true, gamepad: event.gamepad });
    };
    this._onGamepadDisconnected = (event) => {
      if (this.activeGamepad === event.gamepad.index) this.activeGamepad = null;
      this._emit("gamepadchange", { connected: false, gamepad: event.gamepad });
    };

    this.target.addEventListener("keydown", this._onKeyDown, { passive: false });
    this.target.addEventListener("keyup", this._onKeyUp, { passive: false });
    window.addEventListener("blur", this._onBlur);
    window.addEventListener("gamepadconnected", this._onGamepadConnected);
    window.addEventListener("gamepaddisconnected", this._onGamepadDisconnected);
  }

  setBindings(bindings) {
    for (const [action, codes] of Object.entries(bindings)) {
      this.bindings[action] = Array.isArray(codes) ? [...codes] : [codes];
    }
  }

  rebind(action, codes) {
    this.bindings[action] = Array.isArray(codes) ? [...codes] : [codes];
    this.clear();
  }

  _isBoundCode(code) {
    return Object.values(this.bindings).some((codes) => codes.includes(code));
  }

  _keyAction(action, includePressed = false) {
    return (this.bindings[action] || []).some((code) =>
      this.keys.has(code) || (includePressed && this.keyPressed.has(code))
    );
  }

  _findGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.activeGamepad != null && pads[this.activeGamepad]?.connected) {
      return pads[this.activeGamepad];
    }
    for (const pad of pads) {
      if (pad?.connected && pad.mapping === "standard") {
        this.activeGamepad = pad.index;
        return pad;
      }
    }
    return null;
  }

  update() {
    if (!this.enabled) {
      this.clear();
      return this;
    }

    this.pressedActions.clear();
    this.releasedActions.clear();
    for (const action of ACTIONS) {
      this.previousActions.set(action, this.actions.get(action) || false);
    }

    // Include a one-update pulse so fast taps between rendered frames are never lost.
    const keyboardX = (this._keyAction("right", true) ? 1 : 0) - (this._keyAction("left", true) ? 1 : 0);
    const keyboardY = (this._keyAction("down", true) ? 1 : 0) - (this._keyAction("up", true) ? 1 : 0);
    const pad = this._findGamepad();
    const padX = pad ? deadzone(pad.axes[0] || 0, this.deadzone) : 0;
    const padY = pad ? deadzone(pad.axes[1] || 0, this.deadzone) : 0;
    const aimX = pad ? deadzone(pad.axes[2] || 0, this.deadzone) : 0;
    const aimY = pad ? deadzone(pad.axes[3] || 0, this.deadzone) : 0;

    let x = Math.abs(padX) > Math.abs(keyboardX) ? padX : keyboardX;
    let y = Math.abs(padY) > Math.abs(keyboardY) ? padY : keyboardY;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    this.move.x = x;
    this.move.y = y;
    this.move.magnitude = clamp(magnitude, 0, 1);
    this.aim.x = aimX;
    this.aim.y = aimY;
    this.aim.magnitude = clamp(Math.hypot(aimX, aimY), 0, 1);

    let padWasUsed = Math.abs(padX) + Math.abs(padY) + Math.abs(aimX) + Math.abs(aimY) > 0.05;
    for (const action of ACTIONS) {
      const keyboardDown = this._keyAction(action, true);
      const button = pad?.buttons?.[GAMEPAD_BUTTONS[action]];
      const gamepadDown = !!button && (button.pressed || button.value > 0.5);
      padWasUsed ||= gamepadDown;
      const active = keyboardDown || gamepadDown;
      this.actions.set(action, active);
      if (active && !this.previousActions.get(action)) this.pressedActions.add(action);
      if (!active && this.previousActions.get(action)) this.releasedActions.add(action);
    }

    if (padWasUsed) {
      this.inputMethod = "gamepad";
      this.lastInputAt = performance.now();
    } else if (keyboardX || keyboardY || this.keyPressed.size) {
      this.inputMethod = "keyboard";
      this.lastInputAt = performance.now();
    }

    this.keyPressed.clear();
    this.keyReleased.clear();
    return this;
  }

  axis(name) {
    if (name === "horizontal") return this.move.x;
    if (name === "vertical") return this.move.y;
    if (name === "aimHorizontal") return this.aim.x;
    if (name === "aimVertical") return this.aim.y;
    return 0;
  }

  isDown(action) {
    return !!this.actions.get(action);
  }

  wasPressed(action) {
    return this.pressedActions.has(action);
  }

  wasReleased(action) {
    return this.releasedActions.has(action);
  }

  async rumble(strength = 0.35, duration = 90) {
    const pad = this._findGamepad();
    const actuator = pad?.vibrationActuator;
    if (!actuator?.playEffect) return false;
    try {
      await actuator.playEffect("dual-rumble", {
        duration,
        startDelay: 0,
        weakMagnitude: clamp(strength, 0, 1),
        strongMagnitude: clamp(strength * 0.75, 0, 1),
      });
      return true;
    } catch {
      return false;
    }
  }

  on(type, listener) {
    const entry = { type, listener };
    this._listeners.add(entry);
    return () => this._listeners.delete(entry);
  }

  _emit(type, detail) {
    for (const entry of this._listeners) {
      if (entry.type === type) entry.listener(detail);
    }
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.clear();
  }

  clear() {
    this.keys.clear();
    this.keyPressed.clear();
    this.keyReleased.clear();
    this.pressedActions.clear();
    this.releasedActions.clear();
    this.move.x = 0;
    this.move.y = 0;
    this.move.magnitude = 0;
    this.aim.x = 0;
    this.aim.y = 0;
    this.aim.magnitude = 0;
    for (const action of ACTIONS) {
      this.actions.set(action, false);
      this.previousActions.set(action, false);
    }
  }

  destroy() {
    this.target.removeEventListener("keydown", this._onKeyDown);
    this.target.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    window.removeEventListener("gamepadconnected", this._onGamepadConnected);
    window.removeEventListener("gamepaddisconnected", this._onGamepadDisconnected);
    this._listeners.clear();
    this.clear();
  }
}

export default CourtControls;
