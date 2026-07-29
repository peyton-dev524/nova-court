import {
  createVenueGroups,
  normalizeVenueId,
  venueBudgetSnapshot,
  VENUE_IDS,
  VENUE_VIEW_PRESETS,
} from "./venue-scenes.js?v=1.0";

export const VENUE_STORAGE_KEY = "nova-court:selected-venue";

export const VENUE_OPTIONS = Object.freeze([
  Object.freeze({
    id: VENUE_IDS.MONTGOMERY,
    name: "Montgomery Fieldhouse",
    shortName: "Fieldhouse",
    edition: "VENUE / 01",
    capacity: "Compact school gym",
    description: "Warm maple, blue pull-out bleachers, close walls, and an intimate home-court atmosphere.",
    accent: "#56e8ff",
  }),
  Object.freeze({
    id: VENUE_IDS.ARENA_840,
    name: "Crimson 840",
    shortName: "Crimson",
    edition: "VENUE / 02",
    capacity: "840-seat small arena study",
    description: "Red paint, pale wood, arched windows, upper galleries, and steep compact seating on all sides.",
    accent: "#ff4d50",
  }),
]);

export function venueSelectionIndex(venueId) {
  return Math.max(0, VENUE_OPTIONS.findIndex((option) => option.id === normalizeVenueId(venueId)));
}

export function getVenueOption(venueId) {
  return VENUE_OPTIONS[venueSelectionIndex(venueId)];
}

export function cycleVenueSelection(venueId, direction = 1) {
  const current = venueSelectionIndex(venueId);
  const offset = Number(direction) < 0 ? -1 : 1;
  return VENUE_OPTIONS[(current + offset + VENUE_OPTIONS.length) % VENUE_OPTIONS.length].id;
}

export function loadVenueSelection(storage = globalThis.localStorage) {
  try {
    return normalizeVenueId(storage?.getItem?.(VENUE_STORAGE_KEY));
  } catch {
    return VENUE_IDS.MONTGOMERY;
  }
}

export function saveVenueSelection(venueId, storage = globalThis.localStorage) {
  const selected = normalizeVenueId(venueId);
  try {
    storage?.setItem?.(VENUE_STORAGE_KEY, selected);
  } catch {
    // Storage may be disabled. The active session still retains the selection.
  }
  return selected;
}

function disposeRoot(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => value?.isTexture && value.dispose?.());
      material.dispose?.();
    });
  });
  root?.removeFromParent?.();
}

export function createVenueSelectionPreview({
  T,
  container,
  initialVenue = VENUE_IDS.MONTGOMERY,
  quality = "medium",
  reducedMotion = false,
} = {}) {
  if (!T?.WebGLRenderer || !container) throw new TypeError("Venue preview requires THREE and a container.");
  const scene = new T.Scene();
  scene.background = new T.Color(0x05090d);
  scene.fog = new T.Fog(0x05090d, 28, 58);
  const camera = new T.PerspectiveCamera(43, 1, 0.1, 90);
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.25));
  renderer.domElement.className = "venue-select-canvas";
  renderer.domElement.setAttribute("role", "img");
  container.replaceChildren(renderer.domElement);

  const ambient = new T.HemisphereLight(0xe9f3ff, 0x291b16, 1.15);
  const key = new T.DirectionalLight(0xffe6c4, 1.7);
  key.position.set(-7, 12, 7);
  scene.add(ambient, key);
  let root = new T.Group();
  scene.add(root);
  let venueId = normalizeVenueId(initialVenue);
  let frame = 0;
  let visible = false;
  let lastTime = 0;
  let yaw = 0;
  let resizeObserver = null;

  function rebuild(nextVenue) {
    venueId = normalizeVenueId(nextVenue);
    disposeRoot(root);
    root = new T.Group();
    root.name = `venue-preview-${venueId}`;
    for (const group of createVenueGroups(T, venueId, quality)) {
      const value = group.load?.() || group.createFallback?.();
      if (value) root.add(value);
    }
    scene.add(root);
    const pose = VENUE_VIEW_PRESETS[venueId]["court-wide"];
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    renderer.domElement.setAttribute("aria-label", `Live 3D preview of ${getVenueOption(venueId).name}`);
    renderer.render(scene, camera);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(time = 0) {
    if (!visible) {
      frame = 0;
      return;
    }
    resize();
    const dt = Math.min(0.05, Math.max(0, (time - lastTime) / 1000 || 0));
    lastTime = time;
    if (!reducedMotion) {
      yaw += dt * 0.035;
      root.rotation.y = Math.sin(yaw) * 0.035;
    }
    renderer.render(scene, camera);
    frame = globalThis.requestAnimationFrame(render);
  }

  if (typeof globalThis.ResizeObserver === "function") {
    resizeObserver = new globalThis.ResizeObserver(resize);
    resizeObserver.observe(container);
  }
  rebuild(venueId);

  return Object.freeze({
    setVenue(nextVenue) {
      rebuild(nextVenue);
      return venueId;
    },
    setVisible(nextVisible) {
      visible = Boolean(nextVisible);
      if (visible && !frame) frame = globalThis.requestAnimationFrame(render);
      if (!visible && frame) {
        globalThis.cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    getSnapshot() {
      return {
        venueId,
        renderInfo: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
        budget: venueBudgetSnapshot(venueId, quality),
      };
    },
    destroy() {
      visible = false;
      if (frame) globalThis.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      disposeRoot(root);
      renderer.dispose();
      renderer.domElement.remove();
    },
  });
}

