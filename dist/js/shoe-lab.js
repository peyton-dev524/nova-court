import {
  BASKETBALL_SHOE_STYLES,
  PRECISION_7_COLORWAYS,
  createBasketballShoe,
  normalizeBasketballShoeStyle,
  normalizePrecision7Colorway,
} from "./basketball-shoes.js?v=1.3";

const T = globalThis.THREE;
if (!T) throw new Error("Shoe Lab requires THREE.");

const $ = (selector) => document.querySelector(selector);
const query = new URLSearchParams(location.search);
const viewNames = Object.freeze(["front", "three-quarter", "profile", "top", "outsole"]);
const state = {
  styleId: normalizeBasketballShoeStyle(query.get("shoe") || "precision-7"),
  colorwayId: normalizePrecision7Colorway(query.get("colorway")),
  view: viewNames.includes(query.get("view")) ? query.get("view") : "three-quarter",
  wireframe: query.get("wireframe") === "1",
  guides: query.get("guides") !== "0",
  turntable: query.get("turntable") === "1",
  azimuthOffset: 0,
  elevationOffset: 0,
  zoom: 1,
};

const stage = $("#shoe-lab-stage");
const scene = new T.Scene();
scene.background = new T.Color(0x071018);
scene.fog = new T.Fog(0x071018, 1.7, 4.5);

const camera = new T.PerspectiveCamera(35, 1, 0.01, 20);
const renderer = new T.WebGLRenderer({
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
stage.append(renderer.domElement);

const hemisphere = new T.HemisphereLight(0xd9f4ff, 0x17212b, 1.25);
scene.add(hemisphere);
const key = new T.DirectionalLight(0xffffff, 2.3);
key.position.set(1.2, 1.5, 1.7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -0.65;
key.shadow.camera.right = 0.65;
key.shadow.camera.top = 0.65;
key.shadow.camera.bottom = -0.65;
key.shadow.bias = -0.0005;
scene.add(key);
const rim = new T.DirectionalLight(0x60dfff, 1.8);
rim.position.set(-1.3, 0.8, -1.1);
scene.add(rim);
const fill = new T.PointLight(0xffd8bd, 1.15, 3);
fill.position.set(-0.7, 0.35, 0.9);
scene.add(fill);
const outsoleLight = new T.DirectionalLight(0xb8dcff, 2.2);
outsoleLight.position.set(0.25, -1.2, 0.35);
scene.add(outsoleLight);

const floor = new T.Mesh(
  new T.CircleGeometry(0.58, 64),
  new T.MeshStandardMaterial({ color: 0x0d1a22, roughness: 0.92, metalness: 0 }),
);
floor.rotation.x = -Math.PI * 0.5;
floor.position.y = -0.013;
floor.receiveShadow = true;
scene.add(floor);
const grid = new T.GridHelper(1.2, 24, 0x2d7e91, 0x17343d);
grid.position.y = -0.011;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const styleSelect = $("#shoe-lab-style");
const colorwaySelect = $("#shoe-lab-colorway");
styleSelect.replaceChildren(...BASKETBALL_SHOE_STYLES.map((style) => {
  const option = document.createElement("option");
  option.value = style.id;
  option.textContent = style.name;
  return option;
}));
colorwaySelect.replaceChildren(...PRECISION_7_COLORWAYS.map((colorway) => {
  const option = document.createElement("option");
  option.value = colorway.id;
  option.textContent = colorway.name;
  return option;
}));

let shoe = null;
let boxHelper = null;
let shoeBounds = new T.Box3();
let shoeCenter = new T.Vector3();
let shoeSize = new T.Vector3();

function disposeObject(root) {
  root?.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
}

function applyWireframe() {
  shoe?.root.traverse((object) => {
    if (object.material && "wireframe" in object.material) object.material.wireframe = state.wireframe;
  });
}

function dimensionsLabel() {
  return `${(shoeSize.z * 100).toFixed(1)} × ${(shoeSize.x * 100).toFixed(1)} × ${(shoeSize.y * 100).toFixed(1)} cm`;
}

function updateUrl() {
  const next = new URL(location.href);
  next.searchParams.set("shoe", state.styleId);
  next.searchParams.set("colorway", state.colorwayId);
  next.searchParams.set("view", state.view);
  next.searchParams.set("guides", state.guides ? "1" : "0");
  next.searchParams.delete("wireframe");
  next.searchParams.delete("turntable");
  history.replaceState(null, "", next);
}

function updateLabels() {
  const style = BASKETBALL_SHOE_STYLES.find(({ id }) => id === state.styleId);
  $("#shoe-lab-name").textContent = style?.name?.toUpperCase() || state.styleId.toUpperCase();
  $("#shoe-lab-view-name").textContent = state.view.toUpperCase();
  $("#shoe-lab-dimensions").textContent = dimensionsLabel();
  $("#shoe-lab-triangles").textContent = shoe.metrics.triangles.toLocaleString();
  $("#shoe-lab-textures").textContent = String(shoe.metrics.textures || 0);
  $("#shoe-lab-capture-name").textContent = `${state.styleId}-${state.colorwayId}-${state.view}.png`;
  const runtime = shoe.root.userData.sculptRuntime;
  $("#shoe-lab-approximation").textContent = runtime.approximation
    || `${style?.description || "Procedural shoe"} · authored geometry`;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
  });
  styleSelect.value = state.styleId;
  colorwaySelect.value = state.colorwayId;
  colorwaySelect.disabled = state.styleId !== "precision-7";
  $("#shoe-lab-view").value = state.view;
  $("#shoe-lab-turntable").checked = state.turntable;
  $("#shoe-lab-wireframe").checked = state.wireframe;
  $("#shoe-lab-guides").checked = state.guides;
}

function buildShoe() {
  if (shoe) {
    scene.remove(shoe.root);
    disposeObject(shoe.root);
  }
  if (boxHelper) {
    scene.remove(boxHelper);
    boxHelper.geometry?.dispose?.();
    boxHelper.material?.dispose?.();
  }
  shoe = createBasketballShoe(T, {
    styleId: state.styleId,
    colorwayId: state.colorwayId,
    detail: "high",
    side: 1,
  });
  shoe.root.rotation.y = 0;
  scene.add(shoe.root);
  shoe.root.updateMatrixWorld(true);
  shoeBounds = new T.Box3().setFromObject(shoe.root);
  shoeBounds.getCenter(shoeCenter);
  shoeBounds.getSize(shoeSize);
  shoe.root.position.y -= shoeBounds.min.y + 0.011;
  shoe.root.updateMatrixWorld(true);
  shoeBounds.setFromObject(shoe.root);
  shoeBounds.getCenter(shoeCenter);
  shoeBounds.getSize(shoeSize);
  boxHelper = new T.Box3Helper(shoeBounds.clone(), 0x69e5ff);
  boxHelper.material.transparent = true;
  boxHelper.material.opacity = 0.55;
  scene.add(boxHelper);
  applyWireframe();
  updateLabels();
  updateCamera();
  updateUrl();
}

function updateCamera() {
  const span = Math.max(shoeSize.x, shoeSize.y, shoeSize.z);
  const distance = span * 2.55 * state.zoom;
  const target = shoeCenter.clone();
  camera.up.set(0, 1, 0);
  if (state.view === "front") {
    camera.position.set(target.x, target.y + span * 0.08, target.z + distance);
  } else if (state.view === "profile") {
    camera.position.set(target.x + distance, target.y + span * 0.08, target.z);
  } else if (state.view === "top") {
    camera.position.set(target.x, target.y + distance, target.z + 0.002);
    camera.up.set(0, 0, -1);
  } else if (state.view === "outsole") {
    camera.position.set(target.x, target.y - distance, target.z + 0.002);
    camera.up.set(0, 0, 1);
  } else {
    camera.position.set(
      target.x + distance * 0.7,
      target.y + distance * 0.28,
      target.z + distance * 0.7,
    );
  }
  if (!["top", "outsole"].includes(state.view) && state.azimuthOffset) {
    const offset = camera.position.clone().sub(target);
    offset.applyAxisAngle(new T.Vector3(0, 1, 0), state.azimuthOffset);
    camera.position.copy(target).add(offset);
  }
  camera.lookAt(target);
  boxHelper.visible = state.guides;
  grid.visible = state.guides && state.view !== "outsole";
  floor.visible = state.view !== "outsole";
}

function setView(view) {
  if (!viewNames.includes(view)) return false;
  state.view = view;
  state.azimuthOffset = 0;
  state.zoom = 1;
  updateLabels();
  updateCamera();
  updateUrl();
  return true;
}

function setStyle(styleId) {
  const next = normalizeBasketballShoeStyle(styleId);
  if (next !== styleId) return false;
  state.styleId = next;
  buildShoe();
  return true;
}

function setColorway(colorwayId) {
  const next = normalizePrecision7Colorway(colorwayId);
  if (next !== colorwayId) return false;
  state.colorwayId = next;
  buildShoe();
  return true;
}

function saveCapture() {
  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.download = $("#shoe-lab-capture-name").textContent;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
}

styleSelect.addEventListener("change", (event) => setStyle(event.target.value));
colorwaySelect.addEventListener("change", (event) => setColorway(event.target.value));
$("#shoe-lab-view").addEventListener("change", (event) => setView(event.target.value));
$("#shoe-lab-turntable").addEventListener("change", (event) => {
  state.turntable = event.target.checked;
});
$("#shoe-lab-wireframe").addEventListener("change", (event) => {
  state.wireframe = event.target.checked;
  applyWireframe();
});
$("#shoe-lab-guides").addEventListener("change", (event) => {
  state.guides = event.target.checked;
  updateCamera();
  updateUrl();
});
$("#shoe-lab-reset").addEventListener("click", () => setView(state.view));
$("#shoe-lab-capture").addEventListener("click", saveCapture);
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

let dragging = false;
let pointerX = 0;
renderer.domElement.addEventListener("pointerdown", (event) => {
  dragging = true;
  pointerX = event.clientX;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  state.azimuthOffset -= (event.clientX - pointerX) * 0.008;
  pointerX = event.clientX;
});
renderer.domElement.addEventListener("pointerup", (event) => {
  dragging = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.zoom = Math.max(0.62, Math.min(1.8, state.zoom + event.deltaY * 0.001));
}, { passive: false });

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();
buildShoe();

let lastFrame = performance.now();
let metricStart = lastFrame;
let metricFrames = 0;
let readyFrames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.turntable && !dragging && !["top", "outsole"].includes(state.view)) {
    state.azimuthOffset += dt * 0.42;
  }
  updateCamera();
  renderer.render(scene, camera);
  metricFrames += 1;
  readyFrames += 1;
  if (now - metricStart >= 500) {
    $("#shoe-lab-fps").textContent = String(Math.round(metricFrames * 1000 / (now - metricStart)));
    $("#shoe-lab-draws").textContent = String(renderer.info.render.calls);
    metricStart = now;
    metricFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

globalThis.__NOVA_SHOE_LAB__ = Object.freeze({
  setView,
  setStyle,
  setColorway,
  snapshot() {
    return Object.freeze({
      ready: readyFrames >= 2,
      styleId: state.styleId,
      colorwayId: state.colorwayId,
      view: state.view,
      captureName: $("#shoe-lab-capture-name").textContent,
      dimensionsMeters: Object.freeze({
        length: shoeSize.z,
        width: shoeSize.x,
        height: shoeSize.y,
      }),
      metrics: Object.freeze({
        triangles: renderer.info.render.triangles,
        draws: renderer.info.render.calls,
        textures: renderer.info.memory.textures,
        fps: Number($("#shoe-lab-fps").textContent),
      }),
      inferredSurfaces: Object.freeze([
        ...(shoe.root.userData.sculptRuntime?.inferredSurfaces || []),
      ]),
      availableStyles: BASKETBALL_SHOE_STYLES.map(({ id }) => id),
      availableColorways: PRECISION_7_COLORWAYS.map(({ id }) => id),
      assetLoadStatus: "procedural-no-external-models",
    });
  },
});
