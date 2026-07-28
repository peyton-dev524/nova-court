export const PRESENTATION_BUDGET = Object.freeze({
  maximumPlayers: 3,
  maximumCrowdDrawCalls: 2,
  maximumRenderCalls: 140,
  maximumTriangles: 40000,
  maximumGeometries: 200,
  maximumTextures: 12,
  externalAssetBytes: 0,
  rewardWrites: 0,
});

export function assessPresentationBudget(metrics = {}) {
  const measured = {
    calls: Math.max(0, Number(metrics.calls) || 0),
    triangles: Math.max(0, Number(metrics.triangles) || 0),
    geometries: Math.max(0, Number(metrics.geometries) || 0),
    textures: Math.max(0, Number(metrics.textures) || 0),
  };
  const violations = [];
  if (measured.calls > PRESENTATION_BUDGET.maximumRenderCalls) violations.push("calls");
  if (measured.triangles > PRESENTATION_BUDGET.maximumTriangles) violations.push("triangles");
  if (measured.geometries > PRESENTATION_BUDGET.maximumGeometries) violations.push("geometries");
  if (measured.textures > PRESENTATION_BUDGET.maximumTextures) violations.push("textures");
  return { withinBudget: violations.length === 0, violations, measured };
}

export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({ id: "movement", label: "MOVE", control: "WASD / LEFT STICK", copy: "Create an angle, change pace, and keep the defender on your hip.", duration: 3.4 }),
  Object.freeze({ id: "dribbling", label: "DRIBBLE", control: "Q + DIRECTION", copy: "Chain a crossover into open space without standing still.", duration: 3.4 }),
  Object.freeze({ id: "passing", label: "PASS", control: "E / A BUTTON", copy: "Move the defense, then hit the teammate with the clean lane.", duration: 3.2 }),
  Object.freeze({ id: "stealing", label: "STEAL", control: "I / A BUTTON", copy: "Time the reach. A clean steal knocks the ball loose and live.", duration: 3.2 }),
  Object.freeze({ id: "shooting", label: "SHOOT", control: "HOLD + RELEASE SPACE", copy: "Hold to rise, then release in the timing window.", duration: 3.5 }),
  Object.freeze({ id: "finishing", label: "FINISH", control: "SPRINT + SHOOT NEAR RIM", copy: "Attack the paint for a contextual layup or dunk.", duration: 3.7 }),
]);

const ATTRACT_STEPS = Object.freeze([
  { id: "movement", duration: 3.4 },
  { id: "dribbling", duration: 3.1 },
  { id: "passing", duration: 2.7 },
  { id: "shooting", duration: 4.3 },
  { id: "finishing", duration: 4.2 },
]);

function stopPlayers(players) {
  for (const player of players) {
    player.desiredVelocity?.set?.(0, 0, 0);
    player.velocity?.multiplyScalar?.(0.5);
  }
}

function placePlayer(player, x, z, facingX = 0, facingZ = -1) {
  if (!player?.root?.position) return;
  player.root.position.set(x, 0, z);
  player.facing?.set?.(facingX, 0, facingZ)?.normalize?.();
  player.root.rotation.y = Math.atan2(player.facing?.x || 0, player.facing?.z || -1);
}

export function createPresentationDirector(engine, options = {}) {
  const tutorial = options.tutorial === true;
  const steps = tutorial ? TUTORIAL_STEPS : ATTRACT_STEPS;
  let active = true;
  let index = -1;
  let elapsed = 0;
  let stepElapsed = 0;
  let actionFired = false;
  let loops = 0;
  const players = engine?.players || [];

  function resetCourt() {
    stopPlayers(players);
    const [handler, teammate, defender, help] = players;
    placePlayer(handler, -2.8, 3.6, 0.15, -1);
    placePlayer(teammate, 3.4, 1.2, -0.2, -1);
    placePlayer(defender, -1.7, 1.2, -0.1, 1);
    placePlayer(help, 2.1, -1.2, 0, 1);
    if (handler) {
      engine.ball.pickupCooldown = 0;
      engine.givePossession(handler, true);
    }
    engine.setCameraMode?.("broadcast");
  }

  function enterStep(nextIndex) {
    index = nextIndex;
    stepElapsed = 0;
    actionFired = false;
    stopPlayers(players);
    if (index === 0) resetCourt();
    const step = steps[index];
    options.onStep?.({ ...step, index, total: steps.length, tutorial });
  }

  function animateStep(dt) {
    const step = steps[index];
    const [handler, teammate, defender] = players;
    if (!step || !handler) return;
    const wave = Math.sin(stepElapsed * 2.2);
    if (step.id === "movement") {
      handler.desiredVelocity.set(2.4, 0, -1.4 + wave * 0.4);
      if (defender) defender.desiredVelocity.set(1.35, 0, -0.55);
    } else if (step.id === "dribbling") {
      handler.desiredVelocity.set(wave * 1.4, 0, -1.25);
      if (!actionFired && stepElapsed > 0.45) {
        actionFired = engine.performDribbleMove?.(handler, "crossover") !== false;
      }
    } else if (step.id === "passing") {
      handler.desiredVelocity.set(0.3, 0, -0.4);
      teammate?.desiredVelocity?.set?.(-0.5, 0, -0.8);
      if (!actionFired && stepElapsed > 0.75 && teammate) {
        if (!handler.hasBall) {
          engine.ball.pickupCooldown = 0;
          engine.givePossession(handler, true);
        }
        actionFired = engine.pass?.(handler, teammate) !== false;
      }
    } else if (step.id === "stealing") {
      if (defender) {
        placePlayer(defender, handler.root.position.x + 0.55, handler.root.position.z - 0.25, -1, 0);
        defender.setState?.("defend", true);
      }
      if (!actionFired && stepElapsed > 0.8 && defender) {
        if (!handler.hasBall) {
          engine.ball.pickupCooldown = 0;
          engine.givePossession(handler, true);
        }
        const origin = handler.root.position.clone().add({ x: 0, y: 0.45, z: 0 });
        engine.releaseBall(origin, engine._scratchA.set(2.6, 1.1, 0.6), "loose");
        defender.setState?.("defend", true);
        actionFired = true;
      }
    } else if (step.id === "shooting") {
      placePlayer(handler, -2.2, -0.1, 0.15, -1);
      if (!actionFired && stepElapsed > 0.85) {
        engine.ball.pickupCooldown = 0;
        engine.givePossession(handler, true);
        actionFired = engine.shoot?.(handler, 0.95, "jumper") !== false;
      }
    } else if (step.id === "finishing") {
      if (stepElapsed < 1.4) {
        handler.desiredVelocity.set(0.35, 0, -3.6);
      } else if (!actionFired) {
        const basket = engine._basketForTeam?.(handler.team);
        if (basket) placePlayer(handler, basket.x - 0.45, basket.z + basket.attackSign * 1.35, 0, -basket.attackSign);
        engine.ball.pickupCooldown = 0;
        engine.givePossession(handler, true);
        actionFired = engine.shoot?.(handler, 0.97, "layup") !== false;
      }
    }
    if (defender && step.id !== "movement" && step.id !== "stealing") {
      defender.desiredVelocity.set(wave * 0.35, 0, wave * 0.2);
    }
    elapsed += dt;
  }

  resetCourt();
  enterStep(0);

  return {
    update(dt) {
      if (!active) return;
      const safeDt = Math.max(0, Math.min(0.05, Number(dt) || 0));
      stepElapsed += safeDt;
      animateStep(safeDt);
      if (stepElapsed >= steps[index].duration) {
        const next = index + 1;
        if (next >= steps.length) {
          loops += 1;
          if (tutorial && options.loop !== true) {
            active = false;
            stopPlayers(players);
            options.onComplete?.({ loops, elapsed });
            return;
          }
          enterStep(0);
        } else {
          enterStep(next);
        }
      }
    },
    replay() {
      active = true;
      loops = 0;
      elapsed = 0;
      enterStep(0);
    },
    skip() {
      active = false;
      stopPlayers(players);
      options.onSkip?.();
    },
    destroy() {
      active = false;
      stopPlayers(players);
    },
    getSnapshot() {
      return {
        active,
        tutorial,
        stepId: steps[index]?.id || null,
        stepIndex: index,
        stepCount: steps.length,
        loops,
        elapsed,
        rewardWrites: 0,
        budget: { ...PRESENTATION_BUDGET },
      };
    },
  };
}
