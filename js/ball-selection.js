import {
  applyBasketballStyle,
  createBasketballMesh,
  normalizeBasketballStyle,
} from "./basketball-visuals.js?v=1.1";

export const BALL_SELECTION_OPTIONS = Object.freeze([
  Object.freeze({
    id: "classic",
    name: "Classic Orange",
    shortName: "Classic",
    edition: "NOVA / 01",
    finish: "Pebbled orange rubber",
    description: "The regulation-inspired Nova game ball with deep black channels and a warm arena finish.",
    accent: "#ff7848",
  }),
  Object.freeze({
    id: "redWhiteBlue",
    name: "Heritage Tricolor",
    shortName: "Tricolor",
    edition: "NOVA / 02",
    finish: "Red, white, and blue panels",
    description: "A high-contrast alternate finish using the same regulation scale, channels, bounce, and handling.",
    accent: "#5be7ff",
  }),
]);

export function ballSelectionIndex(style) {
  const normalized = normalizeBasketballStyle(style);
  return Math.max(0, BALL_SELECTION_OPTIONS.findIndex((option) => option.id === normalized));
}

export function getBallSelectionOption(style) {
  return BALL_SELECTION_OPTIONS[ballSelectionIndex(style)];
}

export function cycleBallSelection(style, direction = 1) {
  const current = ballSelectionIndex(style);
  const offset = Number(direction) < 0 ? -1 : 1;
  return BALL_SELECTION_OPTIONS[
    (current + offset + BALL_SELECTION_OPTIONS.length) % BALL_SELECTION_OPTIONS.length
  ].id;
}

export function createBallSelectionPreview({
  T,
  container,
  initialStyle = "classic",
  reducedMotion = false,
} = {}) {
  if (!T?.WebGLRenderer || !container) {
    throw new TypeError("Ball selection preview requires THREE and a container.");
  }

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.05, 30);
  camera.position.set(0, 0.12, 4.7);
  camera.lookAt(0, 0.05, 0);

  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
  renderer.domElement.className = "ball-locker-canvas";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "3D preview of Classic Orange basketball");
  container.replaceChildren(renderer.domElement);

  const textureRegistry = [];
  const ball = createBasketballMesh(T, 0.96, {
    anisotropy: renderer.capabilities.getMaxAnisotropy?.() || 1,
    textureRegistry,
    style: normalizeBasketballStyle(initialStyle),
  });
  ball.position.y = 0.14;
  ball.rotation.set(-0.18, -0.42, -0.08);
  scene.add(ball);

  const ambient = new T.HemisphereLight(0xd8f4ff, 0x170b13, 0.78);
  const key = new T.DirectionalLight(0xffead7, 2.25);
  key.position.set(3.4, 4.8, 4.4);
  const fill = new T.DirectionalLight(0x5ceaff, 0.82);
  fill.position.set(-4, 1.4, 3);
  const rim = new T.DirectionalLight(0xff5e3f, 1.4);
  rim.position.set(2.8, 2.8, -4);
  scene.add(ambient, key, fill, rim);

  const pedestal = new T.Mesh(
    new T.CylinderGeometry(1.28, 1.5, 0.13, 64),
    new T.MeshStandardMaterial({
      color: 0x07131a,
      roughness: 0.34,
      metalness: 0.68,
      emissive: 0x06222d,
      emissiveIntensity: 0.7,
    }),
  );
  pedestal.position.y = -1.08;
  scene.add(pedestal);

  const halo = new T.Mesh(
    new T.TorusGeometry(1.34, 0.018, 8, 72),
    new T.MeshBasicMaterial({ color: 0x55e8ff, transparent: true, opacity: 0.82 }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -1.005;
  scene.add(halo);

  const shadow = new T.Mesh(
    new T.CircleGeometry(0.78, 48),
    new T.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.995;
  scene.add(shadow);

  let style = normalizeBasketballStyle(initialStyle);
  let visible = false;
  let frame = 0;
  let lastTime = 0;
  let resizeObserver = null;

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    if (renderer.domElement.width !== Math.round(width * renderer.getPixelRatio())
      || renderer.domElement.height !== Math.round(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };

  const render = (time = 0) => {
    if (!visible) {
      frame = 0;
      return;
    }
    resize();
    const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000 || 0));
    lastTime = time;
    if (!reducedMotion) {
      ball.rotation.y += dt * 0.34;
      ball.position.y = 0.14 + Math.sin(time * 0.00135) * 0.035;
      halo.rotation.z -= dt * 0.16;
    }
    renderer.render(scene, camera);
    frame = globalThis.requestAnimationFrame(render);
  };

  if (typeof globalThis.ResizeObserver === "function") {
    resizeObserver = new globalThis.ResizeObserver(resize);
    resizeObserver.observe(container);
  }

  return Object.freeze({
    setStyle(nextStyle) {
      style = applyBasketballStyle(T, ball, nextStyle, {
        anisotropy: renderer.capabilities.getMaxAnisotropy?.() || 1,
        textureRegistry,
      });
      const option = getBallSelectionOption(style);
      renderer.domElement.setAttribute("aria-label", `3D preview of ${option.name} basketball`);
      renderer.render(scene, camera);
      return style;
    },
    setVisible(nextVisible) {
      visible = Boolean(nextVisible);
      if (visible && !frame) {
        lastTime = 0;
        frame = globalThis.requestAnimationFrame(render);
      } else if (!visible && frame) {
        globalThis.cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    getSnapshot() {
      return {
        style,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
      };
    },
    destroy() {
      visible = false;
      if (frame) globalThis.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      for (const texture of textureRegistry) texture?.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    },
  });
}
