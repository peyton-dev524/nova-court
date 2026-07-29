import {
  BASKETBALL_SHOE_COLORWAYS,
  BASKETBALL_SHOE_STYLES,
} from "./basketball-shoes.js?v=1.3";
import {
  HAIR_STYLES,
  PLAYER_HEIGHT_RANGE,
  SKIN_TONES,
} from "./player-appearance.js?v=1.0";
import { normalizeBasketballJerseyParameters } from "./basketball-jersey.js?v=1.0";

export const TITLE_SHOWCASE_PLAYER_COUNT = 3;

const SHOWCASE_PALETTES = Object.freeze([
  Object.freeze({ primary: 0x38e8ff, accent: 0xf4fbff, shoes: 0xf4fbff }),
  Object.freeze({ primary: 0xff6438, accent: 0xffd166, shoes: 0xfff1dc }),
  Object.freeze({ primary: 0x5af29b, accent: 0x965cff, shoes: 0xe8fff2 }),
  Object.freeze({ primary: 0xffc857, accent: 0xef476f, shoes: 0x251729 }),
  Object.freeze({ primary: 0x29283f, accent: 0xb6fbff, shoes: 0x11121c }),
  Object.freeze({ primary: 0xe947ff, accent: 0x35f3ff, shoes: 0xfff7ff }),
]);

const HEAD_SHAPES = Object.freeze(["round", "long", "wide"]);

function randomIndex(length, random) {
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return Math.floor(roll * length);
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * Builds independent appearance combinations for the menu. Each visible
 * athlete receives a different hair style, skin tone, uniform palette, shoe,
 * and height sample so the title screen reads as a model showcase—not a match.
 */
export function createTitleShowcaseProfiles(random = Math.random) {
  const hairStyles = shuffled(HAIR_STYLES, random);
  const skinTones = shuffled(SKIN_TONES, random);
  const palettes = shuffled(SHOWCASE_PALETTES, random);
  const shoeStyles = shuffled(BASKETBALL_SHOE_STYLES, random);
  const colorways = shuffled(BASKETBALL_SHOE_COLORWAYS, random);
  const headShapes = shuffled(HEAD_SHAPES, random);
  const heightSpan = PLAYER_HEIGHT_RANGE.maxM - PLAYER_HEIGHT_RANGE.minM;

  return Object.freeze(Array.from({ length: TITLE_SHOWCASE_PLAYER_COUNT }, (_, index) => {
    const palette = palettes[index % palettes.length];
    const heightBand = (index + 0.35 + randomIndex(30, random) / 100) / TITLE_SHOWCASE_PLAYER_COUNT;
    const height = Math.round((
      PLAYER_HEIGHT_RANGE.minM + Math.min(0.98, heightBand) * heightSpan
    ) * 100) / 100;
    return Object.freeze({
      id: `title-showcase-${index + 1}`,
      name: `NOVA STYLE ${String(index + 1).padStart(2, "0")}`,
      team: "showcase",
      controlled: false,
      isAI: false,
      height,
      primary: palette.primary,
      accent: palette.accent,
      shoeColor: palette.shoes,
      skinColor: skinTones[index % skinTones.length].color,
      hairStyle: hairStyles[index % hairStyles.length].id,
      headShape: headShapes[index % headShapes.length],
      shoeStyleId: shoeStyles[index % shoeStyles.length].id,
      shoeColorwayId: colorways[index % colorways.length].id,
      jerseyNumber: 1 + randomIndex(98, random),
      jerseyStyle: normalizeBasketballJerseyParameters({
        fit: 0.99 + randomIndex(14, random) / 100,
        length: 0.72 + randomIndex(11, random) / 100,
        hemFlare: 0.024 + randomIndex(30, random) / 1000,
        fabricResponse: 0.42 + randomIndex(45, random) / 100,
      }),
      metadata: Object.freeze({ externallyDriven: true, presentationOnly: true }),
    });
  }));
}

/**
 * Converts an existing engine into a presentation-only model stage. The court,
 * ball, VFX, possession, controls, and shot-clock simulation are kept out of
 * the title composition while the shared production player rigs keep animating.
 */
export function createTitlePlayerShowcase(engine) {
  const players = engine?.players || [];
  const showcaseLights = [];
  let elapsed = 0;
  let active = true;

  if (engine?.worldRoot) engine.worldRoot.visible = false;
  if (engine?.vfxRoot) engine.vfxRoot.visible = false;
  if (engine?.ball?.owner) engine.ball.owner.hasBall = false;
  if (engine?.ball) {
    engine.ball.owner = null;
    engine.ball.state = "showcase-hidden";
  }
  if (engine) {
    engine.controlledPlayer = null;
    engine.shotClock = Number.POSITIVE_INFINITY;
    if (engine.renderer) engine.renderer.toneMappingExposure = 1.02;
    if (engine.T && engine.scene) {
      const coolFill = new engine.T.DirectionalLight(0xbdefff, 0.72);
      coolFill.name = "title-showcase-cool-fill";
      coolFill.position.set(-1.5, 4.2, 5.4);
      const warmRim = new engine.T.DirectionalLight(0xffd5b8, 0.54);
      warmRim.name = "title-showcase-warm-rim";
      warmRim.position.set(5.5, 4.8, 2.4);
      engine.scene.add(coolFill, warmRim);
      showcaseLights.push(coolFill, warmRim);
    }
    // Assign directly so the title presentation does not emit the gameplay
    // "camera changed" toast or announcer line.
    engine.cameraMode = "showcase";
    engine.renderer?.domElement?.setAttribute?.(
      "aria-label",
      "Rotating showcase of randomized Nova Court player styles",
    );
  }

  const spacing = 1.08;
  const centerX = 1.78;
  for (let index = 0; index < players.length; index += 1) {
    const player = players[index];
    const slot = index - (players.length - 1) / 2;
    player.controlled = false;
    player.isAI = false;
    player.hasBall = false;
    player.desiredVelocity?.set?.(0, 0, 0);
    player.velocity?.set?.(0, 0, 0);
    player.root?.position?.set?.(centerX + slot * spacing, 0, Math.abs(slot) * 0.16);
    if (player.root?.rotation) player.root.rotation.y = slot * -0.1;
    if (player.marker) player.marker.visible = false;
    player.setState?.("idle", true);
    player.userData = { ...(player.userData || {}), showcaseSlot: slot };
  }

  return {
    update(dt) {
      if (!active) return;
      elapsed += Math.max(0, Math.min(0.05, Number(dt) || 0));
      for (let index = 0; index < players.length; index += 1) {
        const player = players[index];
        const slot = player.userData?.showcaseSlot || 0;
        if (player.root?.rotation) {
          player.root.rotation.y = slot * -0.1 + Math.sin(elapsed * 0.42 + index * 1.7) * 0.045;
        }
      }
    },
    destroy() {
      active = false;
      for (const light of showcaseLights) light.removeFromParent?.();
    },
    getSnapshot() {
      return Object.freeze({
        active,
        kind: "player-showcase",
        playerCount: players.length,
        courtVisible: engine?.worldRoot?.visible !== false,
        vfxVisible: engine?.vfxRoot?.visible !== false,
        ballVisible: engine?.worldRoot?.visible !== false && engine?.ballMesh?.visible !== false,
        gameplayActions: 0,
        elapsed,
      });
    },
  };
}
